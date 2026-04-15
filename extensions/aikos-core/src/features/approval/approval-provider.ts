import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { eventBus } from '../../core/event-bus';
import { logError, logDebug } from '../../core/logger';
import { VIEW_IDS, DEFAULTS, COMMANDS } from '../../constants';

// ─── Types ────────────────────────────────────────────────────────────────

interface ApprovalRequest {
  id: string;
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  taskId?: string;
  agentType?: string;
  context?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
}

// ─── TreeItem ─────────────────────────────────────────────────────────────

class ApprovalTreeItem extends vscode.TreeItem {
  constructor(public readonly approval: ApprovalRequest) {
    super(approval.actionType, vscode.TreeItemCollapsibleState.None);

    this.id = approval.id;
    this.description = `${approval.riskLevel} · ${approval.status}`;
    this.tooltip = new vscode.MarkdownString(
      `**${approval.actionType}**\n\n` +
      `${approval.description}\n\n` +
      `- Risk: \`${approval.riskLevel}\`\n` +
      `- Status: \`${approval.status}\`\n` +
      (approval.agentType ? `- Agent: \`${approval.agentType}\`\n` : '') +
      `- Created: ${new Date(approval.createdAt).toLocaleString()}\n` +
      (approval.expiresAt ? `- Expires: ${new Date(approval.expiresAt).toLocaleString()}\n` : ''),
    );

    this.iconPath = this.getIcon();
    this.contextValue = approval.status === 'pending' ? 'approval-pending' : 'approval-resolved';

    this.command = {
      command: COMMANDS.APPROVAL_DETAIL,
      title: 'View Approval Detail',
      arguments: [approval.id],
    };
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.approval.status === 'pending') {
      const colorMap: Record<string, string> = {
        critical: 'charts.red',
        high: 'charts.orange',
        medium: 'charts.yellow',
        low: 'charts.blue',
      };
      return new vscode.ThemeIcon(
        'shield',
        new vscode.ThemeColor(colorMap[this.approval.riskLevel] || 'charts.blue'),
      );
    }

    return this.approval.status === 'approved'
      ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.red'));
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────

export class ApprovalTreeProvider implements vscode.TreeDataProvider<ApprovalTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ApprovalTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private approvals: ApprovalRequest[] = [];
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly apiClient: AikosApiClient) {
    eventBus.on('approval:new', (data) => {
      const approval = data as ApprovalRequest;
      this.approvals.unshift(approval);
      this._onDidChangeTreeData.fire(undefined);
    });

    eventBus.on('approval:resolved', (data) => {
      const resolved = data as { id: string; status: string };
      const idx = this.approvals.findIndex(a => a.id === resolved.id);
      if (idx >= 0) {
        this.approvals[idx].status = resolved.status as ApprovalRequest['status'];
        this._onDidChangeTreeData.fire(undefined);
      }
    });
  }

  getTreeItem(element: ApprovalTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ApprovalTreeItem[] {
    if (this.approvals.length === 0) return [];
    // Pending first, then by date
    const sorted = [...this.approvals].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted.map(a => new ApprovalTreeItem(a));
  }

  async refresh(): Promise<void> {
    try {
      this.approvals = await this.apiClient.get<ApprovalRequest[]>('/approvals', { limit: '50' });
      logDebug(`Loaded ${this.approvals.length} approvals`);
    } catch (err) {
      logError('Failed to load approvals', err);
      this.approvals = [];
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  async approve(id: string): Promise<void> {
    try {
      await this.apiClient.post(`/approvals/${id}/approve`);
      vscode.window.showInformationMessage('Approval granted.');
      await this.refresh();
    } catch (err) {
      logError('Failed to approve', err);
      vscode.window.showErrorMessage('Failed to approve action');
    }
  }

  async reject(id: string): Promise<void> {
    const reason = await vscode.window.showInputBox({ prompt: 'Rejection reason (optional)' });
    try {
      await this.apiClient.post(`/approvals/${id}/reject`, { reason });
      vscode.window.showInformationMessage('Approval rejected.');
      await this.refresh();
    } catch (err) {
      logError('Failed to reject', err);
      vscode.window.showErrorMessage('Failed to reject action');
    }
  }

  get pendingCount(): number {
    return this.approvals.filter(a => a.status === 'pending').length;
  }

  startPolling(): void {
    this.pollTimer = setInterval(() => this.refresh(), DEFAULTS.APPROVAL_POLL_INTERVAL);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  dispose(): void {
    this.stopPolling();
    this._onDidChangeTreeData.dispose();
  }

  get isEmpty(): boolean {
    return this.approvals.length === 0;
  }
}

export function registerApprovalView(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): ApprovalTreeProvider {
  const provider = new ApprovalTreeProvider(apiClient);

  const treeView = vscode.window.createTreeView(VIEW_IDS.APPROVALS, {
    treeDataProvider: provider,
  });
  treeView.message = 'No pending approvals.';

  provider.onDidChangeTreeData(() => {
    treeView.message = provider.isEmpty ? 'No pending approvals.' : undefined;
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(`${VIEW_IDS.APPROVALS}.refresh`, () => provider.refresh()),
  );

  provider.refresh();
  provider.startPolling();
  return provider;
}
