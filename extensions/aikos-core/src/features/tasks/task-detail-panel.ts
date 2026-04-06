import * as vscode from 'vscode';
import { AikosApiClient, AgentSSEEvent } from '../../core/api-client';
import { eventBus } from '../../core/event-bus';
import { logInfo, logError } from '../../core/logger';

// ─── Types ────────────────────────────────────────────────────────────────

interface TaskDetail {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  agentType: string;
  progress?: number;
  steps: TaskStep[];
  changedFiles?: ChangedFile[];
  output?: string;
  createdAt: string;
  updatedAt?: string;
  error?: string;
  costUsd?: number;
  tokenCount?: number;
}

interface TaskStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  startedAt?: string;
  completedAt?: string;
}

interface ChangedFile {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  diff?: string;
}

// ─── Task Detail Panel ───────────────────────────────────────────────────

export class TaskDetailPanel {
  private static panels = new Map<string, TaskDetailPanel>();

  private readonly panel: vscode.WebviewPanel;
  private readonly taskId: string;
  private task: TaskDetail | null = null;
  private disposed = false;

  static show(
    context: vscode.ExtensionContext,
    apiClient: AikosApiClient,
    taskId: string,
  ): TaskDetailPanel {
    const existing = TaskDetailPanel.panels.get(taskId);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }

    const panel = new TaskDetailPanel(context, apiClient, taskId);
    TaskDetailPanel.panels.set(taskId, panel);
    return panel;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiClient: AikosApiClient,
    taskId: string,
  ) {
    this.taskId = taskId;

    this.panel = vscode.window.createWebviewPanel(
      'aikos.taskDetail',
      `Task: ${taskId.slice(0, 8)}...`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.iconPath = new vscode.ThemeIcon('tasklist');

    this.panel.onDidDispose(() => {
      this.disposed = true;
      TaskDetailPanel.panels.delete(this.taskId);
    });

    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    // Listen for real-time updates
    eventBus.on('task:updated', (data) => {
      const update = data as Partial<TaskDetail> & { id: string };
      if (update.id === this.taskId) {
        if (this.task) {
          this.task = { ...this.task, ...update };
          this.updateWebview();
        }
      }
    });

    this.loadTask();
  }

  private async loadTask(): Promise<void> {
    try {
      this.task = await this.apiClient.get<TaskDetail>(`/tasks/${this.taskId}`);
      this.panel.title = `Task: ${this.task.title}`;
      this.updateWebview();
    } catch (err) {
      logError('Failed to load task detail', err);
      this.panel.webview.html = this.getErrorHtml('Failed to load task details');
    }
  }

  private async handleMessage(msg: { command: string; [key: string]: unknown }): Promise<void> {
    switch (msg.command) {
      case 'pause':
        await this.apiClient.post(`/tasks/${this.taskId}/stop`);
        this.loadTask();
        break;
      case 'resume':
        await this.apiClient.post(`/tasks/${this.taskId}/resume`);
        this.loadTask();
        break;
      case 'rollback':
        const confirm = await vscode.window.showWarningMessage(
          'Rollback all changes made by this task?',
          { modal: true },
          'Rollback',
        );
        if (confirm === 'Rollback') {
          await this.apiClient.post(`/tasks/${this.taskId}/rollback`);
          vscode.window.showInformationMessage('Task changes rolled back.');
          this.loadTask();
        }
        break;
      case 'viewDiff': {
        const filePath = msg.path as string;
        await showFileDiff(this.apiClient, this.taskId, filePath);
        break;
      }
      case 'applyFile': {
        const filePath = msg.path as string;
        await applyFileChange(this.apiClient, this.taskId, filePath);
        break;
      }
      case 'refresh':
        this.loadTask();
        break;
    }
  }

  private updateWebview(): void {
    if (this.disposed || !this.task) return;
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const task = this.task!;
    const nonce = getNonce();

    const stepsHtml = (task.steps || [])
      .map((s) => {
        const icon = s.status === 'completed' ? '✓'
          : s.status === 'running' ? '⟳'
          : s.status === 'failed' ? '✗'
          : '○';
        const cls = `step step-${s.status}`;
        return `<div class="${cls}">
          <span class="step-icon">${icon}</span>
          <span class="step-name">${escapeHtml(s.name)}</span>
          ${s.output ? `<pre class="step-output">${escapeHtml(s.output)}</pre>` : ''}
        </div>`;
      })
      .join('');

    const filesHtml = (task.changedFiles || [])
      .map((f) => {
        const actionIcon = f.action === 'created' ? '+' : f.action === 'deleted' ? '-' : '~';
        return `<div class="file-item">
          <span class="file-action file-${f.action}">${actionIcon}</span>
          <span class="file-path">${escapeHtml(f.path)}</span>
          <button class="btn-small" onclick="send('viewDiff', '${escapeHtml(f.path)}')">Diff</button>
          ${f.action !== 'deleted' ? `<button class="btn-small" onclick="send('applyFile', '${escapeHtml(f.path)}')">Apply</button>` : ''}
        </div>`;
      })
      .join('');

    const statusColor = task.status === 'completed' ? 'green'
      : task.status === 'running' ? 'yellow'
      : task.status === 'failed' ? 'red'
      : task.status === 'paused' ? 'orange'
      : 'inherit';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .title { font-size: 18px; font-weight: 600; }
    .status { padding: 2px 8px; border-radius: 4px; font-size: 12px; background: ${statusColor}; color: #000; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 16px; }
    .meta span { margin-right: 16px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 4px; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    .btn { padding: 6px 12px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-danger { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .btn-small { padding: 2px 6px; font-size: 11px; border: 1px solid var(--vscode-widget-border); border-radius: 3px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }

    .step { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; }
    .step-icon { width: 16px; text-align: center; font-weight: bold; }
    .step-running .step-icon { color: var(--vscode-charts-yellow); }
    .step-completed .step-icon { color: var(--vscode-charts-green); }
    .step-failed .step-icon { color: var(--vscode-charts-red); }
    .step-output { margin: 4px 0 0 24px; padding: 8px; background: var(--vscode-textCodeBlock-background); border-radius: 4px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; }

    .file-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .file-action { width: 16px; text-align: center; font-weight: bold; font-family: monospace; }
    .file-created { color: var(--vscode-charts-green); }
    .file-modified { color: var(--vscode-charts-yellow); }
    .file-deleted { color: var(--vscode-charts-red); }
    .file-path { font-family: var(--vscode-editor-font-family); font-size: 13px; flex: 1; }

    .output-block { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }

    .progress-bar { height: 4px; background: var(--vscode-progressBar-background); border-radius: 2px; margin: 8px 0; }
    .progress-fill { height: 100%; background: var(--vscode-charts-green); border-radius: 2px; transition: width 0.3s; }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">${escapeHtml(task.title)}</span>
    <span class="status">${task.status.toUpperCase()}</span>
  </div>

  <div class="meta">
    <span>Agent: ${escapeHtml(task.agentType)}</span>
    <span>Created: ${new Date(task.createdAt).toLocaleString()}</span>
    ${task.costUsd != null ? `<span>Cost: $${task.costUsd.toFixed(4)}</span>` : ''}
    ${task.tokenCount != null ? `<span>Tokens: ${task.tokenCount.toLocaleString()}</span>` : ''}
  </div>

  ${task.progress != null ? `<div class="progress-bar"><div class="progress-fill" style="width: ${task.progress}%"></div></div>` : ''}

  <div class="actions">
    ${task.status === 'running' ? '<button class="btn btn-secondary" onclick="send(\'pause\')">⏸ Pause</button>' : ''}
    ${task.status === 'paused' ? '<button class="btn btn-primary" onclick="send(\'resume\')">▶ Resume</button>' : ''}
    ${task.status === 'completed' || task.status === 'failed' ? '<button class="btn btn-danger" onclick="send(\'rollback\')">↩ Rollback</button>' : ''}
    <button class="btn btn-secondary" onclick="send('refresh')">⟳ Refresh</button>
  </div>

  ${task.steps && task.steps.length > 0 ? `
  <div class="section">
    <div class="section-title">Pipeline Steps</div>
    ${stepsHtml}
  </div>` : ''}

  ${task.changedFiles && task.changedFiles.length > 0 ? `
  <div class="section">
    <div class="section-title">Changed Files (${task.changedFiles.length})</div>
    ${filesHtml}
  </div>` : ''}

  ${task.output ? `
  <div class="section">
    <div class="section-title">Output</div>
    <div class="output-block">${escapeHtml(task.output)}</div>
  </div>` : ''}

  ${task.error ? `
  <div class="section">
    <div class="section-title">Error</div>
    <div class="output-block" style="color: var(--vscode-charts-red);">${escapeHtml(task.error)}</div>
  </div>` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function send(command, path) {
      vscode.postMessage({ command, path });
    }
  </script>
</body>
</html>`;
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html><html><body><h3>Error</h3><p>${escapeHtml(message)}</p></body></html>`;
  }
}

// ─── Diff Viewer ──────────────────────────────────────────────────────────

async function showFileDiff(
  apiClient: AikosApiClient,
  taskId: string,
  filePath: string,
): Promise<void> {
  try {
    const diff = await apiClient.get<{ original: string; modified: string }>(
      `/tasks/${taskId}/files/${encodeURIComponent(filePath)}/diff`,
    );

    const originalUri = vscode.Uri.parse(`aikos-diff:original/${filePath}`);
    const modifiedUri = vscode.Uri.parse(`aikos-diff:modified/${filePath}`);

    // Use a simple in-memory content provider approach via untitled docs
    const originalDoc = await vscode.workspace.openTextDocument({
      content: diff.original,
      language: detectLanguage(filePath),
    });
    const modifiedDoc = await vscode.workspace.openTextDocument({
      content: diff.modified,
      language: detectLanguage(filePath),
    });

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalDoc.uri,
      modifiedDoc.uri,
      `${filePath} (Agent Changes)`,
    );
  } catch (err) {
    logError('Failed to show diff', err);
    vscode.window.showErrorMessage('Failed to load file diff');
  }
}

async function applyFileChange(
  apiClient: AikosApiClient,
  taskId: string,
  filePath: string,
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Apply agent changes to ${filePath}?`,
    'Apply',
    'Cancel',
  );
  if (confirm !== 'Apply') return;

  try {
    await apiClient.post(`/tasks/${taskId}/files/${encodeURIComponent(filePath)}/apply`);
    vscode.window.showInformationMessage(`Applied changes to ${filePath}`);
  } catch (err) {
    logError('Failed to apply file change', err);
    vscode.window.showErrorMessage('Failed to apply changes');
  }
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cs: 'csharp',
    css: 'css', html: 'html', json: 'json', md: 'markdown', sql: 'sql',
    yaml: 'yaml', yml: 'yaml', sh: 'shellscript', bat: 'bat',
  };
  return langMap[ext] || 'plaintext';
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
