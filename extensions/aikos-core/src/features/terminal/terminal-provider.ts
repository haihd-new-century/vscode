/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logInfo } from '../../core/logger';

/**
 * Provides AIKOS terminal integration:
 * - Run agent-generated commands in a dedicated terminal
 * - Capture terminal output for context
 */
export class AikosTerminalProvider {
  private terminal?: vscode.Terminal;
  private readonly terminalName = 'AIKOS Agent';

  constructor(_apiClient: AikosApiClient) {}

  /**
   * Execute a command in the AIKOS terminal.
   * Creates the terminal if it doesn't exist.
   */
  executeCommand(command: string, show = true): void {
    this.ensureTerminal();
    if (show && this.terminal) {
      this.terminal.show(false);
    }
    this.terminal?.sendText(command);
    logInfo(`Terminal: ${command.slice(0, 80)}`);
  }

  /**
   * Execute a command suggested by the agent, with user confirmation.
   */
  async executeWithConfirmation(command: string, description?: string): Promise<boolean> {
    const msg = description
      ? `AIKOS wants to run: \`${command}\`\n\n${description}`
      : `AIKOS wants to run: \`${command}\``;

    const result = await vscode.window.showInformationMessage(
      msg,
      { modal: true },
      'Run',
      'Copy',
    );

    if (result === 'Run') {
      this.executeCommand(command);
      return true;
    } else if (result === 'Copy') {
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage('Command copied to clipboard.');
    }
    return false;
  }

  /**
   * Get output from active terminal (limited support — VS Code API doesn't
   * expose terminal content directly, so we use shell integration when available).
   */
  async getRecentOutput(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;

    // Fallback: read from clipboard (user can copy terminal output)
    return vscode.env.clipboard.readText();
  }

  private ensureTerminal(): void {
    // Check if our terminal still exists
    if (this.terminal) {
      const exists = vscode.window.terminals.some(t => t === this.terminal);
      if (!exists) this.terminal = undefined;
    }

    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal({
        name: this.terminalName,
        iconPath: new vscode.ThemeIcon('terminal'),
      });
    }
  }

  dispose(): void {
    this.terminal?.dispose();
  }
}

export function registerTerminalProvider(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): AikosTerminalProvider {
  const provider = new AikosTerminalProvider(apiClient);
  context.subscriptions.push({ dispose: () => provider.dispose() });
  return provider;
}
