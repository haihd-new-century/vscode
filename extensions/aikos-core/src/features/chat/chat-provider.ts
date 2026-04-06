import * as vscode from 'vscode';
import { AikosApiClient, ChatSSEEvent, Citation } from '../../core/api-client';
import { AikosState } from '../../core/state';
import { eventBus } from '../../core/event-bus';
import { logInfo, logError, logDebug } from '../../core/logger';
import { VIEW_IDS } from '../../constants';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = VIEW_IDS.CHAT;
  private webviewView?: vscode.WebviewView;
  private conversationId?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly apiClient: AikosApiClient,
    private readonly state: AikosState,
  ) {
    // Listen for streaming events from WebSocket (alternative to SSE)
    eventBus.on('chat:chunk', (data) => {
      const chunk = data as { content?: string };
      if (chunk.content) {
        this.postMessage({ type: 'streamDelta', content: chunk.content });
      }
    });

    eventBus.on('chat:done', (data) => {
      const done = data as { sources?: Citation[] };
      this.postMessage({ type: 'streamDone', sources: done.sources });
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'webview'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg),
      undefined,
    );

    // Restore state
    this.conversationId = this.state.activeConversationId;
    const model = this.state.selectedModel;
    if (model) {
      this.postMessage({ type: 'setModel', model });
    }

    // Load collections
    this.loadCollections();

    logInfo('Chat webview resolved');
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /** Send a message programmatically (from commands like "Explain Selection") */
  async sendQuery(query: string): Promise<void> {
    // Show the panel
    if (this.webviewView) {
      this.webviewView.show(true);
    }

    // Insert text and auto-send
    this.postMessage({ type: 'insertText', text: query });

    // Small delay then send
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.handleChat(query);
  }

  /** Reveal the chat panel */
  reveal(): void {
    if (this.webviewView) {
      this.webviewView.show(true);
    }
  }

  // ─── Message Handling ───────────────────────────────────────────────

  private async handleWebviewMessage(msg: {
    type: string;
    query?: string;
    collectionId?: string;
    action?: string;
    citation?: Citation;
  }): Promise<void> {
    switch (msg.type) {
      case 'chat':
        if (msg.query) await this.handleChat(msg.query);
        break;

      case 'stop':
        this.apiClient.cancelAll();
        this.postMessage({ type: 'streamDone' });
        break;

      case 'newConversation':
        this.conversationId = undefined;
        this.state.activeConversationId = undefined;
        logDebug('New conversation started');
        break;

      case 'showHistory':
        await this.showConversationHistory();
        break;

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'aikos');
        break;

      case 'selectCollection':
        this.state.selectedCollection = msg.collectionId || undefined;
        logDebug(`Collection selected: ${msg.collectionId || 'none'}`);
        break;

      case 'quickAction':
        await this.handleQuickAction(msg.action || '');
        break;

      case 'openCitation':
        if (msg.citation) await this.openCitation(msg.citation);
        break;
    }
  }

  private async handleChat(query: string): Promise<void> {
    logInfo(`Chat query: ${query.slice(0, 80)}...`);

    this.postMessage({ type: 'streamStart' });

    try {
      const collectedSources: Citation[] = [];

      for await (const event of this.apiClient.chatStream({
        conversationId: this.conversationId,
        query,
        collectionId: this.state.selectedCollection,
        modelId: this.state.selectedModel,
      })) {
        this.handleSSEEvent(event, collectedSources);
      }

      this.postMessage({ type: 'streamDone', sources: collectedSources });

      // Track search
      this.state.addRecentSearch(query);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logError('Chat stream error', err);
      this.postMessage({ type: 'streamError', error: message });
    }
  }

  private handleSSEEvent(event: ChatSSEEvent, sources: Citation[]): void {
    switch (event.type) {
      case 'delta':
        if (event.content) {
          this.postMessage({ type: 'streamDelta', content: event.content });
        }
        break;

      case 'thinking':
        // Stream thinking/reasoning content to webview (rendered in collapsible panel)
        if (event.content) {
          this.postMessage({ type: 'streamThinking', content: event.content });
        }
        break;

      case 'todo':
        // Stream todo/task updates to webview (rendered in task tracker)
        if (event.todo) {
          this.postMessage({ type: 'streamTodo', todo: event.todo });
        }
        break;

      case 'sources':
        if (event.sources) {
          sources.push(...event.sources);
          this.postMessage({ type: 'streamSources', sources: event.sources });
        }
        break;

      case 'error':
        this.postMessage({ type: 'streamError', error: event.error || 'Stream error' });
        break;

      case 'done':
        // Handled after the loop
        break;
    }
  }

  private async handleQuickAction(action: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor. Open a file first.');
      return;
    }

    const selection = editor.document.getText(editor.selection);
    if (!selection) {
      vscode.window.showWarningMessage('No text selected. Select code first.');
      return;
    }

    const lang = editor.document.languageId;
    const prompts: Record<string, string> = {
      explain: `Explain this ${lang} code:\n\`\`\`${lang}\n${selection}\n\`\`\``,
      review: `Review this ${lang} code for bugs, performance, and best practices:\n\`\`\`${lang}\n${selection}\n\`\`\``,
      test: `Generate comprehensive unit tests for this ${lang} code:\n\`\`\`${lang}\n${selection}\n\`\`\``,
      fix: `Find and fix issues in this ${lang} code:\n\`\`\`${lang}\n${selection}\n\`\`\``,
      refactor: `Refactor this ${lang} code to improve readability and maintainability:\n\`\`\`${lang}\n${selection}\n\`\`\``,
    };

    const query = prompts[action];
    if (query) {
      this.postMessage({ type: 'addMessage', role: 'user', content: query });
      await this.handleChat(query);
    }
  }

  private async showConversationHistory(): Promise<void> {
    try {
      const conversations = await this.apiClient.get<
        { id: string; title: string; updatedAt: string }[]
      >('/conversations', { limit: '20', sort: 'updatedAt:desc' });

      const items = conversations.map(c => ({
        label: c.title || 'Untitled',
        description: new Date(c.updatedAt).toLocaleDateString(),
        id: c.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a conversation to resume',
      });

      if (selected) {
        this.conversationId = selected.id;
        this.state.activeConversationId = selected.id;
        this.postMessage({ type: 'clear' });
        logInfo(`Resumed conversation: ${selected.id}`);
        // TODO: Load conversation messages
      }
    } catch (err) {
      logError('Failed to load conversation history', err);
      vscode.window.showErrorMessage('Failed to load conversation history');
    }
  }

  private async openCitation(citation: Citation): Promise<void> {
    // Open citation content in a new editor tab
    const doc = await vscode.workspace.openTextDocument({
      content: citation.content,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }

  private async loadCollections(): Promise<void> {
    try {
      const collections = await this.apiClient.get<{ id: string; name: string }[]>('/collections');
      this.postMessage({
        type: 'setCollections',
        collections,
        selected: this.state.selectedCollection,
      });
    } catch {
      logDebug('Failed to load collections (offline or not available)');
    }
  }

  // ─── HTML Generation ────────────────────────────────────────────────

  private getHtml(webview: vscode.Webview): string {
    const webviewDir = vscode.Uri.joinPath(this.extensionUri, 'webview');
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'chat.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'chat.js'));
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'),
    );
    const nonce = getNonce();
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource};" />
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>AIKOS Chat</title>
</head>
<body>
  <div id="chat-root">
    <div class="chat-header">
      <div class="header-left">
        <span class="header-title">AIKOS Chat</span>
        <span class="header-model" id="model-badge"></span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="btn-new" title="New conversation">
          <span class="codicon codicon-add"></span>
        </button>
        <button class="icon-btn" id="btn-history" title="Conversation history">
          <span class="codicon codicon-history"></span>
        </button>
        <button class="icon-btn" id="btn-settings" title="Settings">
          <span class="codicon codicon-gear"></span>
        </button>
      </div>
    </div>

    <div class="collection-bar" id="collection-bar">
      <span class="collection-label">Collection:</span>
      <select id="collection-select">
        <option value="">None (general)</option>
      </select>
    </div>

    <div class="messages-container" id="messages">
      <div class="welcome-message" id="welcome">
        <div class="welcome-icon">&#129504;</div>
        <h3>Welcome to AIKOS</h3>
        <p>Ask questions about your codebase, documents, or anything in your knowledge base.</p>
        <div class="quick-actions">
          <button class="quick-btn" data-action="explain">Explain selected code</button>
          <button class="quick-btn" data-action="review">Review selected code</button>
          <button class="quick-btn" data-action="test">Generate tests</button>
          <button class="quick-btn" data-action="fix">Fix issues</button>
        </div>
      </div>
    </div>

    <div class="input-area">
      <div class="input-wrapper">
        <textarea
          id="input"
          placeholder="Ask AIKOS..."
          rows="1"
          autocomplete="off"
          spellcheck="true"
        ></textarea>
        <button class="send-btn" id="btn-send" title="Send (Enter)">
          <span class="codicon codicon-send"></span>
        </button>
        <button class="stop-btn hidden" id="btn-stop" title="Stop generation">
          <span class="codicon codicon-debug-stop"></span>
        </button>
      </div>
      <div class="input-footer">
        <span class="char-count" id="char-count"></span>
        <span class="input-hint">Enter to send &middot; Shift+Enter for new line</span>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private postMessage(msg: Record<string, unknown>): void {
    this.webviewView?.webview.postMessage(msg);
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
