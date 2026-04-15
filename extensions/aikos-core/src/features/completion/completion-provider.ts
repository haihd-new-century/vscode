/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { AikosConfig } from '../../core/config';
import { logDebug, logError } from '../../core/logger';

export class AikosCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private lastRequest?: AbortController;

  constructor(
    private readonly apiClient: AikosApiClient,
    private readonly config: AikosConfig,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.config.enableCompletion) return undefined;

    // Cancel any pending request
    this.lastRequest?.abort();

    // Don't complete in comments or strings for most languages
    const lineText = document.lineAt(position.line).text;
    if (lineText.trim().length === 0 && position.character === 0) return undefined;

    // Debounce: wait for typing pause
    await this.debounce(this.config.completionDebounce);

    if (token.isCancellationRequested) return undefined;

    const controller = new AbortController();
    this.lastRequest = controller;

    token.onCancellationRequested(() => controller.abort());

    try {
      // Build context: prefix (lines before cursor) and suffix (lines after)
      const prefixRange = new vscode.Range(
        Math.max(0, position.line - 50), 0,
        position.line, position.character,
      );
      const suffixRange = new vscode.Range(
        position.line, position.character,
        Math.min(document.lineCount - 1, position.line + 20),
        document.lineAt(Math.min(document.lineCount - 1, position.line + 20)).text.length,
      );

      const prefix = document.getText(prefixRange);
      const suffix = document.getText(suffixRange);
      const language = document.languageId;
      const filePath = vscode.workspace.asRelativePath(document.uri);

      logDebug(`Completion request: ${language} ${filePath}:${position.line + 1}`);

      const result = await this.apiClient.post<{
        completion: string;
        confidence?: number;
      }>('/completions', {
        prefix,
        suffix,
        language,
        filePath,
        maxTokens: this.config.maxContextTokens,
      });

      if (token.isCancellationRequested || !result.completion) return undefined;

      // Filter low-confidence completions
      if (result.confidence != null && result.confidence < 0.3) return undefined;

      const completionText = result.completion;

      const item = new vscode.InlineCompletionItem(
        completionText,
        new vscode.Range(position, position),
      );

      return [item];
    } catch (err) {
      if (err instanceof Error && err.message.includes('abort')) return undefined;
      logError('Completion error', err);
      return undefined;
    }
  }

  private debounce(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(resolve, ms);
    });
  }
}

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
  config: AikosConfig,
): void {
  const provider = new AikosCompletionProvider(apiClient, config);

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      provider,
    ),
  );
}
