/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosConfig } from '../../core/config';
import { COMMANDS } from '../../constants';

/**
 * Provides CodeLens actions above functions, classes, and test blocks.
 * Actions: Explain | Review | Test | Refactor
 */
export class AikosCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Simple regex patterns for common constructs
  private static readonly PATTERNS: Record<string, RegExp[]> = {
    // Function/method declarations
    typescript: [
      /^\s*(export\s+)?(async\s+)?function\s+\w+/,
      /^\s*(public|private|protected|static|async)\s+\w+\s*\(/,
      /^\s*(export\s+)?(default\s+)?class\s+\w+/,
      /^\s*(describe|it|test)\s*\(/,
    ],
    javascript: [
      /^\s*(export\s+)?(async\s+)?function\s+\w+/,
      /^\s*(export\s+)?(default\s+)?class\s+\w+/,
      /^\s*(describe|it|test)\s*\(/,
    ],
    python: [
      /^\s*(async\s+)?def\s+\w+/,
      /^\s*class\s+\w+/,
    ],
    java: [
      /^\s*(public|private|protected)\s+.*\s+\w+\s*\(/,
      /^\s*(public|private|protected)?\s*(abstract\s+)?class\s+\w+/,
    ],
    go: [
      /^\s*func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/,
      /^\s*type\s+\w+\s+struct/,
    ],
    rust: [
      /^\s*(pub\s+)?(async\s+)?fn\s+\w+/,
      /^\s*(pub\s+)?struct\s+\w+/,
      /^\s*(pub\s+)?impl\s+/,
    ],
    csharp: [
      /^\s*(public|private|protected|internal)\s+.*\s+\w+\s*\(/,
      /^\s*(public|private|protected|internal)?\s*(abstract\s+)?class\s+\w+/,
    ],
  };

  constructor(private readonly config: AikosConfig) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.config.enableCodeLens) return [];

    const lenses: vscode.CodeLens[] = [];
    const lang = this.mapLanguage(document.languageId);
    const patterns = AikosCodeLensProvider.PATTERNS[lang];
    if (!patterns) return [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.isEmptyOrWhitespace) continue;

      const isMatch = patterns.some(p => p.test(line.text));
      if (!isMatch) continue;

      const range = new vscode.Range(i, 0, i, line.text.length);

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(lightbulb) Explain',
          command: COMMANDS.CHAT_EXPLAIN,
          tooltip: 'Ask AIKOS to explain this code',
        }),
        new vscode.CodeLens(range, {
          title: '$(eye) Review',
          command: COMMANDS.CHAT_REVIEW,
          tooltip: 'Ask AIKOS to review this code',
        }),
        new vscode.CodeLens(range, {
          title: '$(beaker) Test',
          command: COMMANDS.CHAT_TEST,
          tooltip: 'Generate tests for this code',
        }),
      );
    }

    return lenses;
  }

  private mapLanguage(languageId: string): string {
    const map: Record<string, string> = {
      typescriptreact: 'typescript',
      javascriptreact: 'javascript',
      cs: 'csharp',
    };
    return map[languageId] || languageId;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

export function registerCodeLensProvider(
  context: vscode.ExtensionContext,
  config: AikosConfig,
): AikosCodeLensProvider {
  const provider = new AikosCodeLensProvider(config);

  const supportedLanguages = [
    'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
    'python', 'java', 'go', 'rust', 'csharp', 'cs',
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      supportedLanguages.map(lang => ({ language: lang })),
      provider,
    ),
  );

  return provider;
}
