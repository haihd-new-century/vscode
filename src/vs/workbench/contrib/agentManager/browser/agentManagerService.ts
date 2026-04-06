/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Agent Manager Service
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

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

// --- Implementation ---

export class AgentManagerService extends Disposable implements IAgentManagerService {
	declare readonly _serviceBrand: undefined;

	private _session: IAgentSession | undefined;
	private _mode: AgentMode = 'agent';
	private _provider = 'Local';
	private _isGenerating = false;

	private readonly _onDidChangeSession = this._register(new Emitter<void>());
	readonly onDidChangeSession: Event<void> = this._onDidChangeSession.event;

	private readonly _onDidChangeMessages = this._register(new Emitter<void>());
	readonly onDidChangeMessages: Event<void> = this._onDidChangeMessages.event;

	private readonly _onDidChangeMode = this._register(new Emitter<AgentMode>());
	readonly onDidChangeMode: Event<AgentMode> = this._onDidChangeMode.event;

	private readonly _onDidChangeProvider = this._register(new Emitter<string>());
	readonly onDidChangeProvider: Event<string> = this._onDidChangeProvider.event;

	constructor() {
		super();
	}

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
		return ['Local', 'AIKOS API', 'OpenAI', 'Anthropic'];
	}

	getAvailableModels(): string[] {
		if (this._provider === 'Local') {
			return ['Auto'];
		}
		return ['Auto', 'claude-sonnet-4-20250514', 'gpt-4o', 'claude-3-haiku'];
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

		// TODO: Connect to AIKOS API for real response
		// For now, simulate a response
		await new Promise<void>(resolve => {
			setTimeout(() => {
				assistantMsg.content = `I'll help you with that. Let me analyze the request...\n\n**Mode:** ${this._mode}\n**Provider:** ${this._provider}\n\nThis is a placeholder response. Connect to AIKOS API to enable real agent capabilities.`;
				assistantMsg.status = 'done';
				this._isGenerating = false;
				this._onDidChangeMessages.fire();
				resolve();
			}, 1000);
		});
	}

	stopGeneration(): void {
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
}
