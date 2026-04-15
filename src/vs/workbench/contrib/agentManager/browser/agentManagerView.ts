/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAgentManagerService, AgentMode, IAgentMessage } from './agentManagerService.js';
import * as dom from '../../../../base/browser/dom.js';

export class AgentPanelViewPane extends ViewPane {

	private _messagesContainer: HTMLElement | undefined;
	private _inputElement: HTMLTextAreaElement | undefined;
	private _modeButton: HTMLElement | undefined;
	private _providerButton: HTMLElement | undefined;
	private _bodyContainer: HTMLElement | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAgentManagerService private readonly _agentService: IAgentManagerService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this._agentService.onDidChangeMessages(() => this._renderMessages()));
		this._register(this._agentService.onDidChangeMode(() => this._updateModeButton()));
		this._register(this._agentService.onDidChangeProvider(() => this._updateProviderButton()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._bodyContainer = container;
		container.classList.add('aikos-agent-panel');

		// Inject styles
		this._injectStyles(container);

		// --- Header: "New Agent" button ---
		const header = dom.append(container, dom.$('.aikos-agent-header'));
		const newAgentBtn = dom.append(header, dom.$('.aikos-agent-new-btn'));
		const plusIcon = dom.append(newAgentBtn, dom.$('span.aikos-icon'));
		plusIcon.textContent = '+';
		const newAgentLabel = dom.append(newAgentBtn, dom.$('span'));
		newAgentLabel.textContent = localize('newAgent', 'New Agent');
		this._register(dom.addDisposableListener(newAgentBtn, 'click', () => {
			this._agentService.newSession();
		}));

		// --- Messages area ---
		this._messagesContainer = dom.append(container, dom.$('.aikos-agent-messages'));
		this._renderMessages();

		// --- Input area (bottom) ---
		const inputArea = dom.append(container, dom.$('.aikos-agent-input-area'));
		const inputBox = dom.append(inputArea, dom.$('.aikos-agent-input-box'));

		// Text input (full width, top of the box)
		this._inputElement = dom.append(inputBox, dom.$('textarea.aikos-agent-input')) as HTMLTextAreaElement;
		this._inputElement.placeholder = localize('agentPlaceholder', 'Plan, Build, / for commands, @ for context');
		this._inputElement.rows = 1;

		// Auto-resize textarea
		this._register(dom.addDisposableListener(this._inputElement, 'input', () => {
			if (this._inputElement) {
				this._inputElement.style.height = 'auto';
				this._inputElement.style.height = Math.min(this._inputElement.scrollHeight, 200) + 'px';
			}
		}));

		// Submit on Enter (Shift+Enter for newline)
		this._register(dom.addDisposableListener(this._inputElement, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this._submitInput();
			}
		}));

		// --- Bottom controls row: + | Mode | spacer | Provider | Submit ---
		const controls = dom.append(inputBox, dom.$('.aikos-agent-controls'));

		// "+" attach/menu button (left)
		const plusBtn = dom.append(controls, dom.$('.aikos-agent-plus-btn'));
		plusBtn.textContent = '+';
		plusBtn.title = localize('attach', 'Attach context');

		// Mode selector (Agent / Ask / Manual)
		this._modeButton = dom.append(controls, dom.$('.aikos-agent-mode-btn'));
		this._updateModeButton();
		this._register(dom.addDisposableListener(this._modeButton, 'click', (e: MouseEvent) => {
			this._showModeMenu(e);
		}));

		// Spacer pushes provider + submit to the right
		dom.append(controls, dom.$('.aikos-agent-spacer'));

		// Provider selector (Local / AIKOS API / ...)
		this._providerButton = dom.append(controls, dom.$('.aikos-agent-provider-btn'));
		this._updateProviderButton();
		this._register(dom.addDisposableListener(this._providerButton, 'click', (e: MouseEvent) => {
			this._showProviderMenu(e);
		}));

		// Submit button (rightmost)
		const submitBtn = dom.append(controls, dom.$('.aikos-agent-submit-btn'));
		submitBtn.textContent = '\u2191'; // up arrow
		submitBtn.title = localize('submit', 'Submit (Enter)');
		this._register(dom.addDisposableListener(submitBtn, 'click', () => {
			this._submitInput();
		}));
	}

	private _submitInput(): void {
		if (!this._inputElement) { return; }
		const value = this._inputElement.value.trim();
		if (!value) { return; }
		this._inputElement.value = '';
		this._inputElement.style.height = 'auto';
		this._agentService.submitMessage(value);
	}

	private _renderMessages(): void {
		if (!this._messagesContainer) { return; }
		dom.clearNode(this._messagesContainer);

		const messages = this._agentService.getMessages();

		if (messages.length === 0) {
			// Empty state
			const empty = dom.append(this._messagesContainer, dom.$('.aikos-agent-empty'));
			const emptyIcon = dom.append(empty, dom.$('.aikos-agent-empty-icon'));
			emptyIcon.textContent = '\u2728'; // sparkles
			const emptyTitle = dom.append(empty, dom.$('.aikos-agent-empty-title'));
			emptyTitle.textContent = localize('welcomeTitle', 'AIKOS Agent');
			const emptyDesc = dom.append(empty, dom.$('.aikos-agent-empty-desc'));
			emptyDesc.textContent = localize('welcomeDesc', 'Plan and build with AI. Use / for commands, @ to reference context.');
			return;
		}

		for (const msg of messages) {
			this._renderMessage(msg);
		}

		// Scroll to bottom
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private _renderMessage(msg: IAgentMessage): void {
		if (!this._messagesContainer) { return; }

		const msgEl = dom.append(this._messagesContainer, dom.$(`.aikos-agent-msg.aikos-agent-msg-${msg.role}`));

		if (msg.role === 'user') {
			const content = dom.append(msgEl, dom.$('.aikos-agent-msg-content'));
			content.textContent = msg.content;
		} else if (msg.role === 'assistant') {
			if (msg.status === 'streaming' && !msg.content) {
				// Typing indicator
				const dots = dom.append(msgEl, dom.$('.aikos-agent-typing'));
				for (let i = 0; i < 3; i++) {
					const dot = dom.append(dots, dom.$('.aikos-agent-dot'));
					dot.style.animationDelay = `${i * 0.2}s`;
				}
			} else {
				const content = dom.append(msgEl, dom.$('.aikos-agent-msg-content'));
				// Simple markdown-like rendering
				content.innerHTML = this._renderMarkdown(msg.content);
			}

			if (msg.filesChanged && msg.filesChanged.length > 0) {
				const files = dom.append(msgEl, dom.$('.aikos-agent-files'));
				const filesHeader = dom.append(files, dom.$('.aikos-agent-files-header'));
				filesHeader.textContent = `${msg.filesChanged.length} file(s) changed`;
				for (const f of msg.filesChanged) {
					const fileEl = dom.append(files, dom.$('.aikos-agent-file'));
					fileEl.textContent = f;
				}
			}

			if (msg.cost !== undefined) {
				const meta = dom.append(msgEl, dom.$('.aikos-agent-msg-meta'));
				meta.textContent = `$${msg.cost.toFixed(4)}`;
				if (msg.tokens) {
					meta.textContent += ` \u00B7 ${msg.tokens} tokens`;
				}
			}
		}
	}

	private _renderMarkdown(text: string): string {
		// Very basic markdown rendering (safe - no user HTML)
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/`(.+?)`/g, '<code>$1</code>')
			.replace(/\n/g, '<br>');
	}

	private _updateModeButton(): void {
		if (!this._modeButton) { return; }
		const mode = this._agentService.getMode();
		const modeLabels: Record<AgentMode, string> = {
			agent: '\u2728 Agent',
			ask: '\u2753 Ask',
			manual: '\u270F Manual',
		};
		dom.clearNode(this._modeButton);
		const icon = dom.append(this._modeButton, dom.$('span.aikos-mode-icon'));
		icon.textContent = mode === 'agent' ? '\u00BB' : mode === 'ask' ? '?' : '\u270E';
		const label = dom.append(this._modeButton, dom.$('span'));
		label.textContent = modeLabels[mode] || 'Agent';
		const chevron = dom.append(this._modeButton, dom.$('span.aikos-chevron'));
		chevron.textContent = '\u25BE'; // down triangle
	}

	private _updateProviderButton(): void {
		if (!this._providerButton) { return; }
		const provider = this._agentService.getProvider();
		dom.clearNode(this._providerButton);
		const icon = dom.append(this._providerButton, dom.$('span.aikos-provider-icon'));
		icon.textContent = provider === 'Local' ? '\u2302' : '\u2601'; // house or cloud
		const label = dom.append(this._providerButton, dom.$('span'));
		label.textContent = provider;
		const chevron = dom.append(this._providerButton, dom.$('span.aikos-chevron'));
		chevron.textContent = '\u25BE';
	}

	private _showModeMenu(e: MouseEvent): void {
		const modes: AgentMode[] = ['agent', 'ask', 'manual'];
		const modeLabels: Record<AgentMode, string> = {
			agent: 'Agent - Full autonomous agent',
			ask: 'Ask - Answer questions only',
			manual: 'Manual - Suggest, you approve',
		};

		// Simple dropdown using context menu service
		const actions = modes.map(mode => ({
			id: `aikos.mode.${mode}`,
			label: modeLabels[mode],
			enabled: true,
			run: () => this._agentService.setMode(mode),
			class: undefined,
			tooltip: '',
			dispose: () => { },
		}));

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.clientX, y: e.clientY }),
			getActions: () => actions,
		});
	}

	private _showProviderMenu(e: MouseEvent): void {
		const providers = this._agentService.getAvailableProviders();

		const actions = providers.map(provider => ({
			id: `aikos.provider.${provider}`,
			label: provider,
			enabled: true,
			run: () => this._agentService.setProvider(provider),
			class: undefined,
			tooltip: '',
			dispose: () => { },
		}));

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.clientX, y: e.clientY }),
			getActions: () => actions,
		});
	}

	private _injectStyles(container: HTMLElement): void {
		const style = document.createElement('style');
		container.appendChild(style);
		style.textContent = `
			.aikos-agent-panel {
				display: flex;
				flex-direction: column;
				height: 100%;
				overflow: hidden;
				font-family: var(--vscode-font-family);
				font-size: var(--vscode-font-size);
				color: var(--vscode-foreground);
			}

			/* Header */
			.aikos-agent-header {
				display: flex;
				align-items: center;
				justify-content: flex-end;
				padding: 8px 12px;
				border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
			}
			.aikos-agent-new-btn {
				display: flex;
				align-items: center;
				gap: 4px;
				padding: 4px 10px;
				border-radius: 4px;
				cursor: pointer;
				font-size: 12px;
				color: var(--vscode-foreground);
				background: var(--vscode-button-secondaryBackground);
				border: 1px solid var(--vscode-button-secondaryBorder, transparent);
			}
			.aikos-agent-new-btn:hover {
				background: var(--vscode-button-secondaryHoverBackground);
			}
			.aikos-icon {
				font-weight: bold;
				font-size: 14px;
			}

			/* Messages */
			.aikos-agent-messages {
				flex: 1;
				overflow-y: auto;
				padding: 12px;
				scrollbar-width: none;          /* Firefox */
				-ms-overflow-style: none;       /* IE/Edge legacy */
			}
			.aikos-agent-messages::-webkit-scrollbar {
				display: none;                  /* Chromium/WebKit */
				width: 0;
				height: 0;
			}

			/* Empty state */
			.aikos-agent-empty {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				height: 100%;
				text-align: center;
				opacity: 0.7;
				padding: 20px;
			}
			.aikos-agent-empty-icon {
				font-size: 32px;
				margin-bottom: 12px;
			}
			.aikos-agent-empty-title {
				font-size: 16px;
				font-weight: 600;
				margin-bottom: 8px;
			}
			.aikos-agent-empty-desc {
				font-size: 12px;
				opacity: 0.8;
				line-height: 1.5;
			}

			/* Messages */
			.aikos-agent-msg {
				margin-bottom: 12px;
				animation: fadeIn 0.2s ease;
			}
			@keyframes fadeIn {
				from { opacity: 0; transform: translateY(4px); }
				to { opacity: 1; transform: translateY(0); }
			}
			.aikos-agent-msg-user {
				display: flex;
				justify-content: flex-end;
			}
			.aikos-agent-msg-user .aikos-agent-msg-content {
				background: var(--vscode-input-background);
				border: 1px solid var(--vscode-input-border, transparent);
				border-radius: 12px 12px 2px 12px;
				padding: 8px 12px;
				max-width: 85%;
				white-space: pre-wrap;
				word-break: break-word;
			}
			.aikos-agent-msg-assistant .aikos-agent-msg-content {
				padding: 8px 0;
				line-height: 1.6;
				white-space: pre-wrap;
				word-break: break-word;
			}
			.aikos-agent-msg-content code {
				background: var(--vscode-textCodeBlock-background);
				padding: 1px 4px;
				border-radius: 3px;
				font-family: var(--vscode-editor-font-family);
				font-size: 0.9em;
			}
			.aikos-agent-msg-meta {
				font-size: 11px;
				opacity: 0.5;
				margin-top: 4px;
			}

			/* Files changed */
			.aikos-agent-files {
				margin-top: 8px;
				border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
				border-radius: 6px;
				overflow: hidden;
			}
			.aikos-agent-files-header {
				padding: 6px 10px;
				font-size: 11px;
				font-weight: 600;
				background: var(--vscode-sideBarSectionHeader-background);
			}
			.aikos-agent-file {
				padding: 4px 10px;
				font-size: 12px;
				font-family: var(--vscode-editor-font-family);
				border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
			}

			/* Typing indicator */
			.aikos-agent-typing {
				display: flex;
				gap: 4px;
				padding: 8px 4px;
			}
			.aikos-agent-dot {
				width: 6px;
				height: 6px;
				border-radius: 50%;
				background: var(--vscode-foreground);
				opacity: 0.4;
				animation: dotPulse 1.2s ease-in-out infinite;
			}
			@keyframes dotPulse {
				0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
				40% { opacity: 0.8; transform: scale(1); }
			}

			/* Input area — single rounded box, textarea on top, controls on bottom */
			.aikos-agent-input-area {
				padding: 8px 12px 12px;
				border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
			}
			.aikos-agent-input-box {
				display: flex;
				flex-direction: column;
				background: var(--vscode-input-background);
				border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
				border-radius: 10px;
				padding: 8px 10px;
				transition: border-color 0.15s;
			}
			.aikos-agent-input-box:focus-within {
				border-color: var(--vscode-focusBorder);
			}
			.aikos-agent-input,
			.aikos-agent-input:focus,
			.aikos-agent-input:focus-visible {
				width: 100%;
				background: transparent;
				border: none !important;
				outline: none !important;
				box-shadow: none !important;
				color: var(--vscode-input-foreground);
				font-family: var(--vscode-font-family);
				font-size: 13px;
				padding: 2px 0 6px 0;
				resize: none;
				min-height: 22px;
				max-height: 200px;
				line-height: 1.4;
				overflow: hidden;
				scrollbar-width: none;
			}
			.aikos-agent-input::-webkit-scrollbar {
				display: none;
			}
			.aikos-agent-input::placeholder {
				color: var(--vscode-input-placeholderForeground);
			}

			/* Bottom controls row inside the input box */
			.aikos-agent-controls {
				display: flex;
				align-items: center;
				gap: 6px;
				margin-top: 4px;
			}
			.aikos-agent-spacer {
				flex: 1;
			}
			.aikos-agent-plus-btn {
				width: 24px;
				height: 24px;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 6px;
				cursor: pointer;
				font-size: 16px;
				line-height: 1;
				color: var(--vscode-descriptionForeground);
				background: transparent;
				border: 1px solid transparent;
				flex-shrink: 0;
				transition: all 0.15s;
			}
			.aikos-agent-plus-btn:hover {
				background: var(--vscode-toolbar-hoverBackground);
				border-color: var(--vscode-widget-border);
				color: var(--vscode-foreground);
			}
			.aikos-agent-mode-btn,
			.aikos-agent-provider-btn {
				display: flex;
				align-items: center;
				gap: 4px;
				padding: 3px 8px;
				border-radius: 6px;
				cursor: pointer;
				font-size: 12px;
				color: var(--vscode-descriptionForeground);
				background: transparent;
				border: 1px solid transparent;
				transition: all 0.15s;
			}
			.aikos-agent-mode-btn:hover,
			.aikos-agent-provider-btn:hover {
				background: var(--vscode-toolbar-hoverBackground);
				border-color: var(--vscode-widget-border);
			}
			.aikos-chevron {
				font-size: 10px;
				opacity: 0.6;
			}
			.aikos-mode-icon,
			.aikos-provider-icon {
				font-size: 13px;
			}
			.aikos-agent-submit-btn {
				width: 26px;
				height: 26px;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 6px;
				cursor: pointer;
				font-size: 14px;
				font-weight: bold;
				color: var(--vscode-button-foreground);
				background: var(--vscode-button-background);
				border: none;
				flex-shrink: 0;
				transition: background 0.15s;
			}
			.aikos-agent-submit-btn:hover {
				background: var(--vscode-button-hoverBackground);
			}
		`;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._bodyContainer) {
			this._bodyContainer.style.height = `${height}px`;
		}
	}
}
