import { ILLMProvider, LLMRequest, LLMResponse } from './LLMRouter';

export class OllamaProvider implements ILLMProvider {
  name = 'Ollama (Local)';
  private endpoint: string;
  private models: { codeGeneration: string; analysis: string; fast: string };

  constructor(config: any) {
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.models = config.models || {
      codeGeneration: 'deepseek-coder-v2:16b',
      analysis: 'llama3.1:70b',
      fast: 'codellama:7b'
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.selectModel(request);
    const body = {
      model,
      prompt: request.systemPrompt
        ? `${request.systemPrompt}\n\n${request.prompt}`
        : request.prompt,
      stream: false
    };
    const res = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json() as any;
    return { text: data.response, provider: this.name, model };
  }

  private selectModel(request: LLMRequest): string {
    if (request.complexity === 'high') return this.models.analysis;
    if (request.complexity === 'low') return this.models.fast;
    return this.models.codeGeneration;
  }
}