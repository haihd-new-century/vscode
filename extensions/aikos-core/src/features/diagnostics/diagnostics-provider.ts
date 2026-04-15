/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { AikosConfig } from '../../core/config';
import { logDebug, logError } from '../../core/logger';

interface AiDiagnostic {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  code?: string;
  suggestion?: string;
}

export class AikosDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly apiClient: AikosApiClient,
    private readonly config: AikosConfig,
  ) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('aikos');
  }

  /**
   * Analyze a document and provide AI-powered diagnostics.
   * Called on document save or on-demand.
   */
  async analyzeDocument(document: vscode.TextDocument): Promise<void> {
    if (!this.config.enableDiagnostics) return;

    const uri = document.uri.toString();

    // Debounce per-file
    const existing = this.debounceTimers.get(uri);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(uri, setTimeout(async () => {
      this.debounceTimers.delete(uri);
      await this.runAnalysis(document);
    }, 2000));
  }

  private async runAnalysis(document: vscode.TextDocument): Promise<void> {
    const filePath = vscode.workspace.asRelativePath(document.uri);
    const content = document.getText();

    // Skip very large files
    if (content.length > 50_000) {
      logDebug(`Skipping diagnostics for large file: ${filePath}`);
      return;
    }

    try {
      logDebug(`Running AI diagnostics on ${filePath}`);

      const result = await this.apiClient.post<{ diagnostics: AiDiagnostic[] }>('/analyze/code', {
        filePath,
        content,
        language: document.languageId,
      });

      const diagnostics: vscode.Diagnostic[] = (result.diagnostics || []).map(d => {
        const range = new vscode.Range(
          Math.max(0, d.line - 1),
          d.column || 0,
          d.endLine ? d.endLine - 1 : Math.max(0, d.line - 1),
          d.endColumn || Number.MAX_SAFE_INTEGER,
        );

        const severity = this.mapSeverity(d.severity);
        const diagnostic = new vscode.Diagnostic(range, d.message, severity);
        diagnostic.source = 'AIKOS AI';
        if (d.code) diagnostic.code = d.code;

        return diagnostic;
      });

      this.diagnosticCollection.set(document.uri, diagnostics);
      logDebug(`${diagnostics.length} diagnostics for ${filePath}`);
    } catch (err) {
      logError('Diagnostics analysis failed', err);
    }
  }

  private mapSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error': return vscode.DiagnosticSeverity.Error;
      case 'warning': return vscode.DiagnosticSeverity.Warning;
      case 'info': return vscode.DiagnosticSeverity.Information;
      case 'hint': return vscode.DiagnosticSeverity.Hint;
      default: return vscode.DiagnosticSeverity.Information;
    }
  }

  clearDiagnostics(uri?: vscode.Uri): void {
    if (uri) {
      this.diagnosticCollection.delete(uri);
    } else {
      this.diagnosticCollection.clear();
    }
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.diagnosticCollection.dispose();
  }
}

export function registerDiagnosticsProvider(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
  config: AikosConfig,
): AikosDiagnosticsProvider {
  const provider = new AikosDiagnosticsProvider(apiClient, config);

  // Analyze on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => provider.analyzeDocument(doc)),
    { dispose: () => provider.dispose() },
  );

  return provider;
}
