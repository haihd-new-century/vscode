/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logError } from '../../core/logger';

// ─── Types ────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  agentType: string;
  taskId?: string;
  status: 'success' | 'failure' | 'warning';
  detail?: string;
  timestamp: string;
}

// ─── Audit Panel ──────────────────────────────────────────────────────────

export class AuditPanel {
  private outputChannel: vscode.OutputChannel;

  constructor(private readonly apiClient: AikosApiClient) {
    this.outputChannel = vscode.window.createOutputChannel('AIKOS Audit', 'markdown');
  }

  async show(): Promise<void> {
    this.outputChannel.show();
    await this.loadTimeline();
  }

  private async loadTimeline(): Promise<void> {
    this.outputChannel.clear();
    this.outputChannel.appendLine('# AIKOS Audit Timeline\n');

    try {
      const entries = await this.apiClient.get<AuditEntry[]>('/audit/timeline', {
        limit: '100',
        sort: 'timestamp:desc',
      });

      if (entries.length === 0) {
        this.outputChannel.appendLine('No audit entries found.');
        return;
      }

      let currentDate = '';

      for (const entry of entries) {
        const date = entry.timestamp.slice(0, 10);
        if (date !== currentDate) {
          currentDate = date;
          this.outputChannel.appendLine(`\n## ${date}\n`);
        }

        const time = new Date(entry.timestamp).toLocaleTimeString();
        const icon = entry.status === 'success' ? '✓'
          : entry.status === 'failure' ? '✗'
          : '⚠';

        this.outputChannel.appendLine(
          `- \`${time}\` ${icon} **${entry.action}** — ${entry.agentType}` +
          (entry.taskId ? ` (task: ${entry.taskId.slice(0, 8)})` : '') +
          (entry.detail ? `\n  > ${entry.detail}` : ''),
        );
      }

      this.outputChannel.appendLine(`\n---\nShowing ${entries.length} entries`);
    } catch (err) {
      logError('Failed to load audit timeline', err);
      this.outputChannel.appendLine('Failed to load audit timeline.');
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function registerAuditPanel(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): AuditPanel {
  const panel = new AuditPanel(apiClient);
  context.subscriptions.push({ dispose: () => panel.dispose() });
  return panel;
}
