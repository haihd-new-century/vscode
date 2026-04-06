import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logError } from '../../core/logger';

// ─── Types ────────────────────────────────────────────────────────────────

interface ApprovalDetail {
  id: string;
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  taskId?: string;
  agentType?: string;
  context?: Record<string, unknown>;
  reasoning?: string;
  suggestedAction?: string;
  createdAt: string;
  expiresAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ─── Approval Detail Panel ───────────────────────────────────────────────

export class ApprovalDetailPanel {
  private static panels = new Map<string, ApprovalDetailPanel>();

  private readonly panel: vscode.WebviewPanel;
  private approval: ApprovalDetail | null = null;

  static show(
    apiClient: AikosApiClient,
    approvalId: string,
  ): ApprovalDetailPanel {
    const existing = ApprovalDetailPanel.panels.get(approvalId);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }
    return new ApprovalDetailPanel(apiClient, approvalId);
  }

  private constructor(
    private readonly apiClient: AikosApiClient,
    private readonly approvalId: string,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'aikos.approvalDetail',
      `Approval: ${approvalId.slice(0, 8)}...`,
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    this.panel.iconPath = new vscode.ThemeIcon('shield');
    this.panel.onDidDispose(() => ApprovalDetailPanel.panels.delete(this.approvalId));
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    ApprovalDetailPanel.panels.set(approvalId, this);
    this.loadApproval();
  }

  private async loadApproval(): Promise<void> {
    try {
      this.approval = await this.apiClient.get<ApprovalDetail>(`/approvals/${this.approvalId}`);
      this.panel.title = `Approval: ${this.approval.actionType}`;
      this.updateWebview();
    } catch (err) {
      logError('Failed to load approval detail', err);
      this.panel.webview.html = '<html><body><p>Failed to load approval details.</p></body></html>';
    }
  }

  private async handleMessage(msg: { command: string }): Promise<void> {
    if (msg.command === 'approve') {
      try {
        await this.apiClient.post(`/approvals/${this.approvalId}/approve`);
        vscode.window.showInformationMessage('Approval granted.');
        this.loadApproval();
      } catch (err) {
        logError('Failed to approve', err);
      }
    } else if (msg.command === 'reject') {
      const reason = await vscode.window.showInputBox({ prompt: 'Rejection reason (optional)' });
      try {
        await this.apiClient.post(`/approvals/${this.approvalId}/reject`, { reason });
        vscode.window.showInformationMessage('Approval rejected.');
        this.loadApproval();
      } catch (err) {
        logError('Failed to reject', err);
      }
    }
  }

  private updateWebview(): void {
    if (!this.approval) return;
    const a = this.approval;
    const nonce = getNonce();

    const riskColors: Record<string, string> = {
      critical: '#f44336', high: '#ff9800', medium: '#ffc107', low: '#2196f3',
    };
    const riskColor = riskColors[a.riskLevel] || '#999';

    const timeLeft = a.expiresAt && a.status === 'pending'
      ? getTimeLeft(a.expiresAt)
      : null;

    const contextHtml = a.context
      ? `<pre class="context-block">${escapeHtml(JSON.stringify(a.context, null, 2))}</pre>`
      : '';

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; max-width: 700px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .title { font-size: 18px; font-weight: 600; }
    .risk-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: #fff; background: ${riskColor}; }
    .field { margin-bottom: 12px; }
    .field-label { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
    .field-value { font-size: 14px; }
    .context-block { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto; }
    .actions { display: flex; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--vscode-widget-border); }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-approve { background: #4caf50; color: white; }
    .btn-reject { background: #f44336; color: white; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .warning { padding: 8px 12px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
    .expired { color: var(--vscode-charts-red); }
    .reasoning { padding: 12px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid ${riskColor}; border-radius: 0 4px 4px 0; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">${escapeHtml(a.actionType)}</span>
    <span class="risk-badge">${a.riskLevel.toUpperCase()}</span>
  </div>

  ${timeLeft ? `<div class="warning">Expires in ${timeLeft}</div>` : ''}
  ${a.status === 'expired' ? '<div class="warning expired">This approval has expired.</div>' : ''}

  <div class="field">
    <div class="field-label">Description</div>
    <div class="field-value">${escapeHtml(a.description)}</div>
  </div>

  <div class="field">
    <div class="field-label">Status</div>
    <div class="field-value">${a.status}${a.resolvedBy ? ` by ${escapeHtml(a.resolvedBy)}` : ''}</div>
  </div>

  ${a.agentType ? `<div class="field"><div class="field-label">Agent</div><div class="field-value">${escapeHtml(a.agentType)}</div></div>` : ''}

  ${a.reasoning ? `<div class="field"><div class="field-label">Risk Reasoning</div><div class="reasoning">${escapeHtml(a.reasoning)}</div></div>` : ''}

  ${a.suggestedAction ? `<div class="field"><div class="field-label">Suggested Action</div><div class="field-value">${escapeHtml(a.suggestedAction)}</div></div>` : ''}

  ${contextHtml ? `<div class="field"><div class="field-label">Context</div>${contextHtml}</div>` : ''}

  <div class="field">
    <div class="field-label">Created</div>
    <div class="field-value">${new Date(a.createdAt).toLocaleString()}</div>
  </div>

  ${a.status === 'pending' ? `
  <div class="actions">
    <button class="btn btn-approve" onclick="send('approve')">Approve</button>
    <button class="btn btn-reject" onclick="send('reject')">Reject</button>
  </div>` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function send(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
  }
}

function getTimeLeft(expiresAt: string): string | null {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < 32; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
  return r;
}
