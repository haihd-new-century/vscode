import { AikosConfig } from './config';
import { logInfo, logError, logDebug, logWarn } from './logger';
import { DEFAULTS } from '../constants';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: { apiVersion: string; requestId: string; timestamp: string };
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

export interface ChatSSEEvent {
  type: 'delta' | 'thinking' | 'todo' | 'sources' | 'done' | 'error';
  content?: string;
  sources?: Citation[];
  error?: string;
  /** Structured todo/task update from model */
  todo?: {
    id: string;
    action: 'add' | 'update' | 'complete';
    title: string;
    status?: 'pending' | 'in_progress' | 'done' | 'failed';
    progress?: number;
  };
  /** Whether the response included thinking content */
  hasThinking?: boolean;
}

export interface AgentSSEEvent {
  type: 'step_start' | 'step_complete' | 'delta' | 'thinking' | 'todo' | 'sources' | 'done' | 'error';
  agent_type?: string;
  content?: string;
  sources?: Citation[];
  execution_id?: string;
  error?: string;
  todo?: ChatSSEEvent['todo'];
}

export interface Citation {
  index: number;
  chunk_id: string;
  content: string;
  document_name?: string;
  score: number;
  supported: boolean;
  type?: 'text' | 'image' | 'table';
  page_number?: number;
}

// ─── API Client ────────────────────────────────────────────────────────────

export class AikosApiClient {
  private apiKey = '';
  private abortControllers = new Map<string, AbortController>();

  constructor(private config: AikosConfig) {}

  async initialize(): Promise<boolean> {
    this.apiKey = await this.config.getApiKey();
    if (!this.apiKey) {
      logWarn('No API key configured');
      return false;
    }
    return this.healthCheck();
  }

  // ─── REST Methods ────────────────────────────────────────────────────

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.config.apiUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', `${this.config.apiUrl}${path}`, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', `${this.config.apiUrl}${path}`, body);
  }

  async del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', `${this.config.apiUrl}${path}`);
  }

  // ─── Agent Service Methods ───────────────────────────────────────────

  async agentPost<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', `${this.config.agentServiceUrl}${path}`, body);
  }

  async agentGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.config.agentServiceUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    return this.request<T>('GET', url.toString());
  }

  // ─── SSE Streaming ───────────────────────────────────────────────────

  async *chatStream(body: {
    conversationId?: string;
    query: string;
    collectionId?: string;
    modelId?: string;
    enableThinking?: boolean;
    thinkingBudget?: number;
    /** Optional Unity session id; the backend forwards Unity tool calls to it. */
    unitySessionId?: string;
  }): AsyncGenerator<ChatSSEEvent> {
    yield* this.sseStream<ChatSSEEvent>(
      `${this.config.apiUrl}/chat/completions/stream`,
      'POST',
      body,
    );
  }

  async *agentStream(params: {
    query: string;
    collectionId?: string;
    model?: string;
    enableReasoning?: boolean;
  }): AsyncGenerator<AgentSSEEvent> {
    const url = new URL('/agent/stream', this.config.apiUrl);
    url.searchParams.set('query', params.query);
    if (params.collectionId) url.searchParams.set('collection_id', params.collectionId);
    if (params.model) url.searchParams.set('model', params.model);
    if (params.enableReasoning) url.searchParams.set('enable_reasoning', 'true');

    yield* this.sseStream<AgentSSEEvent>(url.toString(), 'GET');
  }

  // ─── Health ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('GET', `${this.config.apiUrl}/health/ready`);
      logInfo('API health check passed');
      return true;
    } catch (err) {
      logError('API health check failed', err);
      return false;
    }
  }

  // ─── Cancel ──────────────────────────────────────────────────────────

  cancelAll(): void {
    for (const [id, controller] of this.abortControllers) {
      controller.abort();
      this.abortControllers.delete(id);
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < DEFAULTS.API_MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: this.headers(),
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(DEFAULTS.API_TIMEOUT),
        });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
          logWarn(`Rate limited, retrying after ${retryAfter}s`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`API ${method} ${res.status}: ${text.slice(0, 200)}`);
        }

        const json = (await res.json()) as Record<string, unknown>;
        return (json.data ?? json) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < DEFAULTS.API_MAX_RETRIES - 1 && !lastError.message.includes('abort')) {
          logDebug(`Retry ${attempt + 1}/${DEFAULTS.API_MAX_RETRIES}: ${lastError.message}`);
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  private async *sseStream<T>(
    url: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): AsyncGenerator<T> {
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);

    try {
      const res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`SSE ${res.status}: ${await res.text().catch(() => '')}`);
      }
      if (!res.body) {
        throw new Error('No response body for SSE stream');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              yield JSON.parse(data) as T;
            } catch {
              // Skip malformed SSE data
            }
          }
        }
      }
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
