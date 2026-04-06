import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { eventBus } from '../../core/event-bus';
import { logError, logDebug } from '../../core/logger';
import { COMMANDS, VIEW_IDS } from '../../constants';

// ─── Types ────────────────────────────────────────────────────────────────

interface AgentTask {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  agentType: string;
  progress?: number;
  createdAt: string;
  updatedAt?: string;
  error?: string;
  changedFiles?: { path: string; action: string }[];
}

// ─── Group Item ──────────────────────────────────────────────────────────

class TaskGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly tasks: AgentTask[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${tasks.length}`;
    this.contextValue = 'task-group';
  }
}

type TaskTreeElement = TaskGroupItem | TaskTreeItem;

// ─── TreeItem ─────────────────────────────────────────────────────────────

class TaskTreeItem extends vscode.TreeItem {
  constructor(public readonly task: AgentTask) {
    super(task.title, vscode.TreeItemCollapsibleState.None);

    this.id = task.id;
    this.description = `${task.agentType} · ${task.status}`;
    this.tooltip = new vscode.MarkdownString(
      `**${task.title}**\n\n` +
      `- Status: \`${task.status}\`\n` +
      `- Agent: \`${task.agentType}\`\n` +
      (task.progress != null ? `- Progress: ${task.progress}%\n` : '') +
      `- Created: ${new Date(task.createdAt).toLocaleString()}\n` +
      (task.error ? `- Error: ${task.error}\n` : ''),
    );

    this.iconPath = this.getIcon();
    this.contextValue = `task-${task.status}`;

    // Click to open detail panel
    this.command = {
      command: 'aikos.task.detail',
      title: 'View Task Detail',
      arguments: [task.id],
    };
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.task.status) {
      case 'running':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
      case 'completed':
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      case 'failed':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      case 'paused':
        return new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.orange'));
      case 'pending':
      default:
        return new vscode.ThemeIcon('clock');
    }
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────

export class TasksTreeProvider implements vscode.TreeDataProvider<TaskTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private tasks: AgentTask[] = [];

  constructor(private readonly apiClient: AikosApiClient) {
    // Auto-refresh on task events
    eventBus.on('task:updated', (data) => {
      const update = data as AgentTask;
      const idx = this.tasks.findIndex(t => t.id === update.id);
      if (idx >= 0) {
        this.tasks[idx] = { ...this.tasks[idx], ...update };
      } else {
        this.tasks.unshift(update);
      }
      this._onDidChangeTreeData.fire(undefined);
    });

    eventBus.on('task:completed', () => {
      this.refresh();
    });
  }

  getTreeItem(element: TaskTreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeElement): TaskTreeElement[] {
    if (element instanceof TaskGroupItem) {
      return element.tasks.map(t => new TaskTreeItem(t));
    }

    if (this.tasks.length === 0) return [];

    // Group by status
    const groups: Record<string, AgentTask[]> = {};
    const order = ['running', 'paused', 'pending', 'completed', 'failed'];

    for (const task of this.tasks) {
      if (!groups[task.status]) groups[task.status] = [];
      groups[task.status].push(task);
    }

    const result: TaskTreeElement[] = [];
    for (const status of order) {
      if (groups[status]?.length) {
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        result.push(new TaskGroupItem(`${label}`, groups[status]));
      }
    }
    return result;
  }

  async refresh(): Promise<void> {
    try {
      this.tasks = await this.apiClient.get<AgentTask[]>('/tasks', { limit: '50', sort: 'createdAt:desc' });
      logDebug(`Loaded ${this.tasks.length} tasks`);
    } catch (err) {
      logError('Failed to load tasks', err);
      this.tasks = [];
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  async stopTask(taskId: string): Promise<void> {
    try {
      await this.apiClient.post(`/tasks/${taskId}/stop`);
      vscode.window.showInformationMessage(`Task stopped.`);
      await this.refresh();
    } catch (err) {
      logError('Failed to stop task', err);
      vscode.window.showErrorMessage('Failed to stop task');
    }
  }

  async resumeTask(taskId: string): Promise<void> {
    try {
      await this.apiClient.post(`/tasks/${taskId}/resume`);
      vscode.window.showInformationMessage(`Task resumed.`);
      await this.refresh();
    } catch (err) {
      logError('Failed to resume task', err);
      vscode.window.showErrorMessage('Failed to resume task');
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  get isEmpty(): boolean {
    return this.tasks.length === 0;
  }
}

export function registerTasksView(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): TasksTreeProvider {
  const provider = new TasksTreeProvider(apiClient);

  const treeView = vscode.window.createTreeView(VIEW_IDS.TASKS, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  treeView.message = 'No tasks yet. Press Ctrl+Shift+T to submit a task.';

  // Update message on data changes
  provider.onDidChangeTreeData(() => {
    treeView.message = provider.isEmpty ? 'No tasks yet. Press Ctrl+Shift+T to submit a task.' : undefined;
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(`${VIEW_IDS.TASKS}.refresh`, () => provider.refresh()),
  );

  // Initial load
  provider.refresh();

  return provider;
}
