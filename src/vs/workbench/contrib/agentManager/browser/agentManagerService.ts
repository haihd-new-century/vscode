/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

// --- Types ---

export type AgentMode = 'agent' | 'ask' | 'manual';

export interface IAgentMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	status?: 'pending' | 'streaming' | 'done' | 'error';
	toolCalls?: { name: string; status: string }[];
	filesChanged?: string[];
	cost?: number;
	tokens?: number;
}

export interface IAgentSession {
	id: string;
	title: string;
	messages: IAgentMessage[];
	mode: AgentMode;
	provider: string;
	model: string;
	createdAt: number;
	isActive: boolean;
}

export interface IAgentManagerService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeSession: Event<void>;
	readonly onDidChangeMessages: Event<void>;
	readonly onDidChangeMode: Event<AgentMode>;
	readonly onDidChangeProvider: Event<string>;

	getSession(): IAgentSession | undefined;
	getMessages(): IAgentMessage[];
	getMode(): AgentMode;
	getProvider(): string;
	getAvailableProviders(): string[];
	getAvailableModels(): string[];

	newSession(): void;
	setMode(mode: AgentMode): void;
	setProvider(provider: string): void;
	submitMessage(content: string): Promise<void>;
	stopGeneration(): void;
	clearSession(): void;

	togglePanel(): void;
	focusPanel(): void;
}

export const IAgentManagerService = createDecorator<IAgentManagerService>('agentManagerService');

// --- Configuration keys ---

const CONFIG_API_URL = 'aikos.apiUrl';
const CONFIG_AGENT_SERVICE_URL = 'aikos.agentServiceUrl';
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const DEFAULT_AGENT_URL = 'http://localhost:8100';

// --- SSE Event types from AIKOS API ---

interface AikosSSEEvent {
	type: 'delta' | 'thinking' | 'sources' | 'done' | 'error';
	content?: string;
	error?: string;
	sources?: { index: number; content: string; document_name?: string; score: number }[];
}

// --- Implementation ---

export class AgentManagerService extends Disposable implements IAgentManagerService {
	declare readonly _serviceBrand: undefined;

	private _session: IAgentSession | undefined;
	private _mode: AgentMode = 'agent';
	private _provider = 'AIKOS API';
	private _isGenerating = false;
	private _abortController: AbortController | undefined;

	private readonly _onDidChangeSession = this._register(new Emitter<void>());
	readonly onDidChangeSession: Event<void> = this._onDidChangeSession.event;

	private readonly _onDidChangeMessages = this._register(new Emitter<void>());
	readonly onDidChangeMessages: Event<void> = this._onDidChangeMessages.event;

	private readonly _onDidChangeMode = this._register(new Emitter<AgentMode>());
	readonly onDidChangeMode: Event<AgentMode> = this._onDidChangeMode.event;

	private readonly _onDidChangeProvider = this._register(new Emitter<string>());
	readonly onDidChangeProvider: Event<string> = this._onDidChangeProvider.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	// --- Config helpers ---

	private get apiUrl(): string {
		return this.configurationService.getValue<string>(CONFIG_API_URL) || DEFAULT_API_URL;
	}

	private get agentServiceUrl(): string {
		return this.configurationService.getValue<string>(CONFIG_AGENT_SERVICE_URL) || DEFAULT_AGENT_URL;
	}

	// --- Public API ---

	getSession(): IAgentSession | undefined {
		return this._session;
	}

	getMessages(): IAgentMessage[] {
		return this._session?.messages ?? [];
	}

	getMode(): AgentMode {
		return this._mode;
	}

	getProvider(): string {
		return this._provider;
	}

	getAvailableProviders(): string[] {
		return ['AIKOS API', 'Local', 'OpenAI', 'Anthropic'];
	}

	getAvailableModels(): string[] {
		if (this._provider === 'Local') {
			return ['Auto'];
		}
		return ['Auto', 'claude-sonnet-4-20250514', 'gpt-4o', 'claude-3-haiku', 'gemini-2.0-flash'];
	}

	newSession(): void {
		this._session = {
			id: `session-${Date.now()}`,
			title: 'New Agent',
			messages: [],
			mode: this._mode,
			provider: this._provider,
			model: 'Auto',
			createdAt: Date.now(),
			isActive: true,
		};
		this._onDidChangeSession.fire();
		this._onDidChangeMessages.fire();
	}

	setMode(mode: AgentMode): void {
		this._mode = mode;
		if (this._session) {
			this._session.mode = mode;
		}
		this._onDidChangeMode.fire(mode);
	}

	setProvider(provider: string): void {
		this._provider = provider;
		if (this._session) {
			this._session.provider = provider;
		}
		this._onDidChangeProvider.fire(provider);
	}

	async submitMessage(content: string): Promise<void> {
		if (!this._session) {
			this.newSession();
		}

		const userMsg: IAgentMessage = {
			id: `msg-${Date.now()}`,
			role: 'user',
			content,
			timestamp: Date.now(),
			status: 'done',
		};
		this._session!.messages.push(userMsg);
		this._onDidChangeMessages.fire();

		// Create assistant response placeholder
		const assistantMsg: IAgentMessage = {
			id: `msg-${Date.now() + 1}`,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			status: 'streaming',
		};
		this._session!.messages.push(assistantMsg);
		this._isGenerating = true;
		this._onDidChangeMessages.fire();

		try {
			if (this._mode === 'agent') {
				await this._streamAgentResponse(content, assistantMsg);
			} else {
				await this._streamChatResponse(content, assistantMsg);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			if (errorMessage.includes('aborted')) {
				// User cancelled — already handled in stopGeneration()
				return;
			}
			assistantMsg.content = assistantMsg.content
				? `${assistantMsg.content}\n\n⚠ Error: ${errorMessage}`
				: `⚠ Failed to get response: ${errorMessage}`;
			assistantMsg.status = 'error';
			this._isGenerating = false;
			this._onDidChangeMessages.fire();
		}
	}

	stopGeneration(): void {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = undefined;
		}
		if (this._isGenerating && this._session) {
			const lastMsg = this._session.messages[this._session.messages.length - 1];
			if (lastMsg && lastMsg.status === 'streaming') {
				lastMsg.status = 'done';
				lastMsg.content += '\n\n*[Generation stopped]*';
			}
			this._isGenerating = false;
			this._onDidChangeMessages.fire();
		}
	}

	clearSession(): void {
		this.stopGeneration();
		this._session = undefined;
		this._onDidChangeSession.fire();
		this._onDidChangeMessages.fire();
	}

	togglePanel(): void {
		// Handled by view service externally
	}

	focusPanel(): void {
		// Handled by view service externally
	}

	// --- Streaming helpers ---

	/**
	 * Stream a chat completion from the AIKOS API (ask mode).
	 * Uses SSE endpoint: POST /chat/completions/stream
	 */
	private async _streamChatResponse(query: string, assistantMsg: IAgentMessage): Promise<void> {
		const url = `${this.apiUrl}/chat/completions/stream`;
		const body = {
			query,
			conversationId: this._session?.id,
			modelId: this._session?.model === 'Auto' ? undefined : this._session?.model,
		};

		await this._consumeSSEStream(url, 'POST', body, assistantMsg);
	}

	/**
	 * Stream an agent execution from the AIKOS Agent Service (agent mode).
	 * Uses SSE endpoint: GET /agent/stream?query=...
	 */
	private async _streamAgentResponse(query: string, assistantMsg: IAgentMessage): Promise<void> {
		const baseUrl = this.agentServiceUrl || this.apiUrl;
		const url = new URL('/agent/stream', baseUrl);
		url.searchParams.set('query', query);
		if (this._session?.model && this._session.model !== 'Auto') {
			url.searchParams.set('model', this._session.model);
		}

		await this._consumeSSEStream(url.toString(), 'GET', undefined, assistantMsg);
	}

	/**
	 * Generic SSE stream consumer. Reads `data:` lines and updates the assistant message.
	 */
	private async _consumeSSEStream(
		url: string,
		method: 'GET' | 'POST',
		body: unknown | undefined,
		assistantMsg: IAgentMessage,
	): Promise<void> {
		this._abortController = new AbortController();

		const res = await fetch(url, {
			method,
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream',
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: this._abortController.signal,
		});

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
		}

		if (!res.body) {
			throw new Error('No response body for SSE stream');
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) { break; }

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) { continue; }
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						assistantMsg.status = 'done';
						this._isGenerating = false;
						this._onDidChangeMessages.fire();
						return;
					}

					try {
						const event: AikosSSEEvent = JSON.parse(data);
						this._handleSSEEvent(event, assistantMsg);
					} catch {
						// Skip malformed JSON
					}
				}
			}
		} finally {
			this._abortController = undefined;
		}

		// Stream ended without [DONE] — mark as done
		assistantMsg.status = 'done';
		this._isGenerating = false;
		this._onDidChangeMessages.fire();
	}

	private _handleSSEEvent(event: AikosSSEEvent, assistantMsg: IAgentMessage): void {
		switch (event.type) {
			case 'delta':
				if (event.content) {
					assistantMsg.content += event.content;
					this._onDidChangeMessages.fire();
				}
				break;

			case 'thinking':
				// Append thinking content in a collapsed section
				if (event.content) {
					assistantMsg.content += event.content;
					this._onDidChangeMessages.fire();
				}
				break;

			case 'sources':
				if (event.sources && event.sources.length > 0) {
					const refs = event.sources
						.map(s => `- [${s.document_name || 'Source'}] (score: ${s.score.toFixed(2)})`)
						.join('\n');
					assistantMsg.content += `\n\n**Sources:**\n${refs}`;
					this._onDidChangeMessages.fire();
				}
				break;

			case 'error':
				assistantMsg.content += `\n\n⚠ ${event.error || 'Unknown error'}`;
				assistantMsg.status = 'error';
				this._isGenerating = false;
				this._onDidChangeMessages.fire();
				break;

			case 'done':
				assistantMsg.status = 'done';
				this._isGenerating = false;
				this._onDidChangeMessages.fire();
				break;
		}
	}
}
