import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logError } from '../../core/logger';

// ─── Types ────────────────────────────────────────────────────────────────

interface MetricsDashboard {
  cost: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    dailyLimit?: number;
    history: { date: string; cost: number }[];
  };
  tokens: {
    today: number;
    thisMonth: number;
    byModel: { model: string; tokens: number; cost: number }[];
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    avgDuration: number;
  };
  approvals: {
    total: number;
    approved: number;
    rejected: number;
    expired: number;
    avgResponseTime: number;
  };
}

// ─── Metrics Panel ────────────────────────────────────────────────────────

export class MetricsPanel {
  private static instance: MetricsPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly apiClient: AikosApiClient) {}

  static create(apiClient: AikosApiClient): MetricsPanel {
    if (!MetricsPanel.instance) {
      MetricsPanel.instance = new MetricsPanel(apiClient);
    }
    return MetricsPanel.instance;
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aikos.metrics',
      'AIKOS Metrics',
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    this.panel.iconPath = new vscode.ThemeIcon('graph');
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'refresh') this.loadMetrics();
    });

    await this.loadMetrics();
  }

  private async loadMetrics(): Promise<void> {
    if (!this.panel) return;

    try {
      const data = await this.apiClient.get<MetricsDashboard>('/metrics/dashboard');
      this.panel.webview.html = this.getHtml(data);
    } catch (err) {
      logError('Failed to load metrics', err);
      this.panel.webview.html = this.getErrorHtml();
    }
  }

  private getHtml(data: MetricsDashboard): string {
    const nonce = getNonce();

    const costHistoryBars = data.cost.history.slice(-14).map(h => {
      const maxCost = Math.max(...data.cost.history.map(x => x.cost), 1);
      const pct = (h.cost / maxCost) * 100;
      return `<div class="bar-col">
        <div class="bar" style="height: ${pct}%" title="$${h.cost.toFixed(2)}"></div>
        <span class="bar-label">${h.date.slice(5)}</span>
      </div>`;
    }).join('');

    const modelRows = data.tokens.byModel.map(m => `
      <tr>
        <td>${escapeHtml(m.model)}</td>
        <td>${m.tokens.toLocaleString()}</td>
        <td>$${m.cost.toFixed(4)}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; }
    h1 { font-size: 20px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 16px; }
    .card-title { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .card-value { font-size: 24px; font-weight: 600; }
    .card-sub { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }

    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }

    .chart { display: flex; align-items: flex-end; gap: 4px; height: 120px; padding: 8px 0; }
    .bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; height: 100%; justify-content: flex-end; }
    .bar { width: 100%; max-width: 24px; background: var(--vscode-charts-blue); border-radius: 2px 2px 0 0; min-height: 2px; }
    .bar-label { font-size: 9px; color: var(--vscode-descriptionForeground); margin-top: 4px; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border); color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; }
    td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border); }

    .btn { padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>AIKOS Metrics Dashboard</h1>

  <div class="grid">
    <div class="card">
      <div class="card-title">Today's Cost</div>
      <div class="card-value">$${data.cost.today.toFixed(2)}</div>
      ${data.cost.dailyLimit ? `<div class="card-sub">${((data.cost.today / data.cost.dailyLimit) * 100).toFixed(0)}% of $${data.cost.dailyLimit} limit</div>` : ''}
    </div>
    <div class="card">
      <div class="card-title">This Week</div>
      <div class="card-value">$${data.cost.thisWeek.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="card-title">This Month</div>
      <div class="card-value">$${data.cost.thisMonth.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="card-title">Tokens Today</div>
      <div class="card-value">${formatNumber(data.tokens.today)}</div>
      <div class="card-sub">${formatNumber(data.tokens.thisMonth)} this month</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Tasks</div>
      <div class="card-value">${data.tasks.total}</div>
      <div class="card-sub">${data.tasks.completed} completed, ${data.tasks.failed} failed, ${data.tasks.running} running</div>
    </div>
    <div class="card">
      <div class="card-title">Avg Task Duration</div>
      <div class="card-value">${formatDuration(data.tasks.avgDuration)}</div>
    </div>
    <div class="card">
      <div class="card-title">Approvals</div>
      <div class="card-value">${data.approvals.total}</div>
      <div class="card-sub">${data.approvals.approved} approved, ${data.approvals.rejected} rejected</div>
    </div>
    <div class="card">
      <div class="card-title">Avg Approval Time</div>
      <div class="card-value">${formatDuration(data.approvals.avgResponseTime)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Daily Cost (Last 14 Days)</div>
    <div class="chart">${costHistoryBars}</div>
  </div>

  <div class="section">
    <div class="section-title">Cost by Model</div>
    <table>
      <thead><tr><th>Model</th><th>Tokens</th><th>Cost</th></tr></thead>
      <tbody>${modelRows}</tbody>
    </table>
  </div>

  <button class="btn" onclick="vscode.postMessage({command:'refresh'})">Refresh</button>

  <script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
  }

  private getErrorHtml(): string {
    return `<!DOCTYPE html><html><body>
      <h3>Failed to load metrics</h3>
      <p>Check your API connection and try again.</p>
    </body></html>`;
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < 32; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
  return r;
}
