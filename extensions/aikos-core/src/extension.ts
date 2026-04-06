import * as vscode from 'vscode';
import { AikosConfig } from './core/config';
import { AikosApiClient } from './core/api-client';
import { AikosWebSocket } from './core/websocket';
import { AikosState } from './core/state';
import { eventBus } from './core/event-bus';
import { logInfo, logError, logWarn, disposeLogger } from './core/logger';
import { COMMANDS, DEFAULTS, VIEW_IDS } from './constants';
import { ChatViewProvider } from './features/chat/chat-provider';
import { registerTasksView, TasksTreeProvider } from './features/tasks/tasks-provider';
import { registerApprovalView, ApprovalTreeProvider } from './features/approval/approval-provider';
import { registerCollectionsView, CollectionsTreeProvider } from './features/collections/collections-provider';
import { registerSearchView, SearchTreeProvider } from './features/search/search-provider';
import { registerMemoryView, MemoryTreeProvider } from './features/memory/memory-provider';
import { AikosStatusBar } from './features/metrics/status-bar';
import { registerCompletionProvider } from './features/completion/completion-provider';
import { registerCodeLensProvider } from './features/codelens/codelens-provider';
import { registerDiagnosticsProvider } from './features/diagnostics/diagnostics-provider';
import { registerTerminalProvider } from './features/terminal/terminal-provider';
import { registerNL2SQLPanel, NL2SQLPanel } from './features/nl2sql/nl2sql-panel';
import { registerAgentStreamViewer, AgentStreamViewer } from './features/tasks/agent-stream-viewer';
import { TaskDetailPanel } from './features/tasks/task-detail-panel';
import { registerTaskTracker, TaskTracker } from './features/tasks/task-tracker';
import { ApprovalDetailPanel } from './features/approval/approval-detail-panel';
import { MetricsPanel } from './features/metrics/metrics-panel';
import { registerAuditPanel, AuditPanel } from './features/audit/audit-panel';
import { registerWorkflowPanel, WorkflowPanel } from './features/workflow/workflow-panel';

// ─── Global instances ──────────────────────────────────────────────────────

let config: AikosConfig;
let apiClient: AikosApiClient;
let ws: AikosWebSocket;
let state: AikosState;
let aikosStatusBar: AikosStatusBar;
let healthCheckTimer: ReturnType<typeof setInterval> | undefined;
let chatProvider: ChatViewProvider;
let tasksProvider: TasksTreeProvider;
let approvalProvider: ApprovalTreeProvider;
let collectionsProvider: CollectionsTreeProvider;
let searchProvider: SearchTreeProvider;
let nl2sqlPanel: NL2SQLPanel;
let agentViewer: AgentStreamViewer;
let taskTracker: TaskTracker;
let memoryProvider: MemoryTreeProvider;
let metricsPanel: MetricsPanel;
let auditPanel: AuditPanel;
let workflowPanel: WorkflowPanel;

// ─── Activate ──────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logInfo('AIKOS AI extension activating...');

  // 1. Initialize core services
  config = new AikosConfig(context);
  apiClient = new AikosApiClient(config);
  ws = new AikosWebSocket();
  state = new AikosState(context);

  // 2. Register commands
  registerCommands(context);

  // 3. Register views
  chatProvider = new ChatViewProvider(context.extensionUri, apiClient, state);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider),
  );
  tasksProvider = registerTasksView(context, apiClient);
  approvalProvider = registerApprovalView(context, apiClient);
  collectionsProvider = registerCollectionsView(context, apiClient, state);
  searchProvider = registerSearchView(context, apiClient, state);
  memoryProvider = registerMemoryView(context, apiClient);

  // 3b. Register editor providers
  registerCompletionProvider(context, apiClient, config);
  registerCodeLensProvider(context, config);
  registerDiagnosticsProvider(context, apiClient, config);
  registerTerminalProvider(context, apiClient);
  nl2sqlPanel = registerNL2SQLPanel(context, apiClient);
  agentViewer = registerAgentStreamViewer(context, apiClient);
  taskTracker = registerTaskTracker(context, ws);
  metricsPanel = MetricsPanel.create(apiClient);
  auditPanel = registerAuditPanel(context, apiClient);
  workflowPanel = registerWorkflowPanel(context, apiClient);

  // 4. Create status bar
  aikosStatusBar = new AikosStatusBar(apiClient, state);
  context.subscriptions.push({ dispose: () => aikosStatusBar.dispose() });

  // 5. Try to connect
  const connected = await apiClient.initialize();
  aikosStatusBar.updateConnection(connected);

  if (connected) {
    // Connect WebSocket
    const apiKey = await config.getApiKey();
    ws.connect(config.apiUrl, apiKey);

    logInfo('AIKOS AI connected successfully');
  } else {
    const apiKey = await config.getApiKey();
    if (!apiKey) {
      const action = await vscode.window.showInformationMessage(
        'AIKOS AI: Set your API key to get started.',
        'Set API Key',
      );
      if (action === 'Set API Key') {
        vscode.commands.executeCommand(COMMANDS.SETTINGS);
      }
    } else {
      logWarn('AIKOS AI: API unreachable. Will retry every 30s.');
    }
  }

  // 6. Health check interval with offline detection
  healthCheckTimer = setInterval(async () => {
    const ok = await apiClient.healthCheck();
    aikosStatusBar.updateConnection(ok);
    state.isOffline = !ok;
    if (ok && !ws.isConnected) {
      const apiKey = await config.getApiKey();
      ws.connect(config.apiUrl, apiKey);
    }
  }, DEFAULTS.HEALTH_CHECK_INTERVAL);

  // 7. Listen for config changes
  context.subscriptions.push(
    config.onDidChange(() => {
      logInfo('Configuration changed, reconnecting...');
      eventBus.fire('config:changed');
      ws.disconnect();
      apiClient.initialize().then((ok) => {
        aikosStatusBar.updateConnection(ok);
        if (ok) {
          config.getApiKey().then(key => ws.connect(config.apiUrl, key));
        }
      });
    }),
  );

  // 8. Listen for approval events → show notification
  eventBus.on('approval:new', (data: unknown) => {
    if (!config.notificationsApproval) return;
    const approval = data as { id: string; actionType: string; riskLevel: string };
    showApprovalNotification(approval);
  });

  logInfo('AIKOS AI extension activated');
}

// ─── Deactivate ────────────────────────────────────────────────────────────

export function deactivate(): void {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  ws.disconnect();
  apiClient.cancelAll();
  disposeLogger();
}

// ─── Commands ──────────────────────────────────────────────────────────────

function registerCommands(context: vscode.ExtensionContext): void {
  const reg = (id: string, handler: (...args: unknown[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  // Chat commands
  reg(COMMANDS.CHAT_ASK, () => handleChatAction('ask'));
  reg(COMMANDS.CHAT_EXPLAIN, () => handleChatAction('explain'));
  reg(COMMANDS.CHAT_REVIEW, () => handleChatAction('review'));
  reg(COMMANDS.CHAT_FIX, () => handleChatAction('fix'));
  reg(COMMANDS.CHAT_TEST, () => handleChatAction('test'));
  reg(COMMANDS.CHAT_REFACTOR, () => handleChatAction('refactor'));

  // Search
  reg(COMMANDS.SEARCH_KNOWLEDGE, handleSearchKnowledge);

  // Tasks
  reg(COMMANDS.TASK_SUBMIT, handleTaskSubmit);
  reg(COMMANDS.TASK_LIST, () => vscode.commands.executeCommand(`${VIEW_IDS.TASKS}.focus`));
  reg(COMMANDS.TASK_STOP, (taskId: unknown) => handleTaskAction('stop', taskId as string));
  reg(COMMANDS.TASK_RESUME, (taskId: unknown) => handleTaskAction('resume', taskId as string));
  reg(COMMANDS.TASK_DETAIL, (taskId: unknown) => {
    if (taskId) TaskDetailPanel.show(context, apiClient, taskId as string);
  });
  reg(COMMANDS.TASK_ROLLBACK, (taskId: unknown) => handleTaskAction('rollback', taskId as string));

  // Approvals
  reg(COMMANDS.APPROVAL_LIST, () => vscode.commands.executeCommand(`${VIEW_IDS.APPROVALS}.focus`));
  reg(COMMANDS.APPROVAL_APPROVE, (id: unknown) => handleApproval('approve', id as string));
  reg(COMMANDS.APPROVAL_REJECT, (id: unknown) => handleApproval('reject', id as string));
  reg(COMMANDS.APPROVAL_DETAIL, (id: unknown) => {
    if (id) ApprovalDetailPanel.show(apiClient, id as string);
  });

  // Collections
  reg(COMMANDS.COLLECTIONS_ADD_FILE, (...args: unknown[]) => handleAddFileToCollection(args[0] as vscode.Uri | undefined));

  // Other
  reg(COMMANDS.NL2SQL, handleNl2sql);
  reg(COMMANDS.METRICS, () => metricsPanel.show());
  reg(COMMANDS.AUDIT, () => auditPanel.show());
  reg(COMMANDS.WORKFLOWS, () => workflowPanel.showAndPick());
  reg(COMMANDS.SETTINGS, () => handleSettings(context));
  reg(COMMANDS.COMPLETION_TRIGGER, () => {
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });
}

// ─── Command Handlers ──────────────────────────────────────────────────────

async function handleChatAction(action: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  let selectedText = '';
  let filePath = '';
  let lineNumber = 0;

  if (editor) {
    const selection = editor.selection;
    selectedText = editor.document.getText(selection);
    filePath = vscode.workspace.asRelativePath(editor.document.uri);
    lineNumber = selection.start.line + 1;
  }

  if (action !== 'ask' && !selectedText) {
    vscode.window.showWarningMessage('AIKOS: Select some code first.');
    return;
  }

  let query: string;
  if (action === 'ask') {
    const input = await vscode.window.showInputBox({
      prompt: 'Ask AIKOS AI anything...',
      placeHolder: 'e.g., How does the auth middleware work?',
    });
    if (!input) return;
    query = input;
  } else {
    const actionMap: Record<string, string> = {
      explain: 'Explain this code in detail',
      review: 'Review this code for bugs, security issues, and improvements',
      fix: 'Fix any issues in this code',
      test: 'Generate comprehensive unit tests for this code',
      refactor: 'Refactor this code for better readability and performance',
    };
    query = `${actionMap[action]}:\n\nFile: ${filePath}:${lineNumber}\n\`\`\`\n${selectedText}\n\`\`\``;
  }

  // Route through the chat webview provider
  try {
    await chatProvider.sendQuery(query);
  } catch (err) {
    logError('Chat action failed', err);
    vscode.window.showErrorMessage(`AIKOS: Chat failed — ${err instanceof Error ? err.message : err}`);
  }
}

async function handleSearchKnowledge(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Search AIKOS Knowledge Base',
    placeHolder: 'e.g., authentication flow, database schema...',
  });
  if (!query) return;

  await searchProvider.search(query);
  vscode.commands.executeCommand(`${VIEW_IDS.SEARCH}.focus`);
}

async function handleTaskSubmit(): Promise<void> {
  const description = await vscode.window.showInputBox({
    prompt: 'Describe the task for AIKOS Agent',
    placeHolder: 'e.g., Fix the login timeout bug in auth/session.ts',
  });
  if (!description) return;

  // Stream agent execution in real-time
  await agentViewer.streamTask({
    query: description,
    collectionId: state.selectedCollection || config.defaultCollection || undefined,
    model: state.selectedModel || config.defaultModel || undefined,
  });

  // Refresh task list
  await tasksProvider.refresh();
}

async function handleTaskAction(action: string, taskId?: string): Promise<void> {
  if (!taskId) {
    vscode.window.showWarningMessage('AIKOS: No task selected.');
    return;
  }
  if (action === 'stop') {
    await tasksProvider.stopTask(taskId);
  } else if (action === 'resume') {
    await tasksProvider.resumeTask(taskId);
  } else if (action === 'rollback') {
    const confirm = await vscode.window.showWarningMessage(
      'Rollback all changes made by this task?', { modal: true }, 'Rollback',
    );
    if (confirm === 'Rollback') {
      try {
        await apiClient.post(`/tasks/${taskId}/rollback`);
        vscode.window.showInformationMessage('Task changes rolled back.');
        await tasksProvider.refresh();
      } catch {
        vscode.window.showErrorMessage('Failed to rollback task');
      }
    }
  }
}

async function handleApproval(action: 'approve' | 'reject', id?: string): Promise<void> {
  if (!id) return;
  if (action === 'approve') {
    await approvalProvider.approve(id);
  } else {
    await approvalProvider.reject(id);
  }
}

async function handleAddFileToCollection(uri?: vscode.Uri): Promise<void> {
  if (!uri) {
    vscode.window.showWarningMessage('AIKOS: No file selected.');
    return;
  }
  await collectionsProvider.addFile(uri);
}

async function handleNl2sql(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Ask a question in natural language',
    placeHolder: 'e.g., How many users signed up today?',
  });
  if (!query) return;

  await nl2sqlPanel.query(query);
}

async function handleSettings(context: vscode.ExtensionContext): Promise<void> {
  const current = await config.getApiKey();
  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your AIKOS API key',
    password: true,
    placeHolder: 'ako_...',
    value: current ? '********' : '',
  });

  if (apiKey && apiKey !== '********') {
    await config.setApiKey(apiKey);
    const ok = await apiClient.initialize();
    aikosStatusBar.updateConnection(ok);

    if (ok) {
      ws.disconnect();
      ws.connect(config.apiUrl, apiKey);
      vscode.window.showInformationMessage('AIKOS: Connected successfully!');
    } else {
      vscode.window.showErrorMessage('AIKOS: Connection failed. Check your API key and server URL.');
    }
  }
}

// ─── UI Helpers ────────────────────────────────────────────────────────────

async function showApprovalNotification(approval: {
  id: string;
  actionType: string;
  riskLevel: string;
}): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    `AIKOS Approval: ${approval.actionType} (${approval.riskLevel} risk)`,
    'Approve',
    'Reject',
    'View Details',
  );

  if (action === 'Approve') {
    vscode.commands.executeCommand(COMMANDS.APPROVAL_APPROVE, approval.id);
  } else if (action === 'Reject') {
    vscode.commands.executeCommand(COMMANDS.APPROVAL_REJECT, approval.id);
  } else if (action === 'View Details') {
    vscode.commands.executeCommand(`${VIEW_IDS.APPROVALS}.focus`);
  }
}

