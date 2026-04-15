/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logError, logInfo } from '../../core/logger';

interface NL2SQLResult {
  generated_sql: string;
  formatted_answer?: string;
  results?: unknown[];
  execution_time_ms?: number;
}

/**
 * NL2SQL panel: natural language to SQL queries.
 * Shows generated SQL and results in an output channel or webview.
 */
export class NL2SQLPanel {
  private outputChannel: vscode.OutputChannel;

  constructor(private readonly apiClient: AikosApiClient) {
    this.outputChannel = vscode.window.createOutputChannel('AIKOS NL2SQL', 'sql');
  }

  async query(naturalLanguage: string): Promise<void> {
    this.outputChannel.show();
    this.outputChannel.appendLine(`\n${'─'.repeat(60)}`);
    this.outputChannel.appendLine(`-- Query: ${naturalLanguage}`);
    this.outputChannel.appendLine(`-- Time: ${new Date().toLocaleTimeString()}`);
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('-- Generating SQL...');

    try {
      const result = await this.apiClient.agentPost<NL2SQLResult>('/api/v1/nl2sql/query', {
        query: naturalLanguage,
        execute: true,
      });

      // Show generated SQL
      this.outputChannel.appendLine('-- Generated SQL:');
      this.outputChannel.appendLine(result.generated_sql);
      this.outputChannel.appendLine('');

      // Show formatted answer
      if (result.formatted_answer) {
        this.outputChannel.appendLine(`-- Answer: ${result.formatted_answer}`);
        this.outputChannel.appendLine('');
      }

      // Show results as table
      if (result.results && Array.isArray(result.results) && result.results.length > 0) {
        this.outputChannel.appendLine(`-- Results (${result.results.length} rows):`);
        this.outputChannel.appendLine(this.formatTable(result.results));
      }

      if (result.execution_time_ms) {
        this.outputChannel.appendLine(`\n-- Execution time: ${result.execution_time_ms}ms`);
      }

      logInfo(`NL2SQL query completed: ${naturalLanguage.slice(0, 50)}`);

      // Offer to copy SQL
      const action = await vscode.window.showInformationMessage(
        'NL2SQL query completed.',
        'Copy SQL',
        'Open in Editor',
      );

      if (action === 'Copy SQL') {
        await vscode.env.clipboard.writeText(result.generated_sql);
      } else if (action === 'Open in Editor') {
        const doc = await vscode.workspace.openTextDocument({
          content: result.generated_sql,
          language: 'sql',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`-- ERROR: ${message}`);
      logError('NL2SQL query failed', err);
      vscode.window.showErrorMessage(`NL2SQL failed: ${message}`);
    }
  }

  private formatTable(rows: unknown[]): string {
    if (rows.length === 0) return '(empty)';

    const firstRow = rows[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);

    // Calculate column widths
    const widths = keys.map(k => {
      const values = rows.map(r => String((r as Record<string, unknown>)[k] ?? ''));
      return Math.max(k.length, ...values.map(v => v.length));
    });

    // Header
    const header = keys.map((k, i) => k.padEnd(widths[i])).join(' | ');
    const separator = widths.map(w => '─'.repeat(w)).join('─┼─');

    // Rows
    const dataRows = rows.slice(0, 50).map(row => {
      const r = row as Record<string, unknown>;
      return keys.map((k, i) => String(r[k] ?? '').padEnd(widths[i])).join(' | ');
    });

    let result = `${header}\n${separator}\n${dataRows.join('\n')}`;
    if (rows.length > 50) {
      result += `\n... and ${rows.length - 50} more rows`;
    }
    return result;
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function registerNL2SQLPanel(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): NL2SQLPanel {
  const panel = new NL2SQLPanel(apiClient);
  context.subscriptions.push({ dispose: () => panel.dispose() });
  return panel;
}
