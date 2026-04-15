/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CONFIG_SECTION, DEFAULTS, SECRET_KEYS } from '../constants';

export class AikosConfig {
  private secrets: vscode.SecretStorage;

  constructor(context: vscode.ExtensionContext) {
    this.secrets = context.secrets;
  }

  private get cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  get apiUrl(): string {
    return this.cfg.get<string>('apiUrl', DEFAULTS.API_URL);
  }

  get agentServiceUrl(): string {
    return this.cfg.get<string>('agentServiceUrl', DEFAULTS.AGENT_SERVICE_URL);
  }

  get defaultCollection(): string {
    return this.cfg.get<string>('defaultCollection', '');
  }

  get defaultModel(): string {
    return this.cfg.get<string>('defaultModel', '');
  }

  get enableCompletion(): boolean {
    return this.cfg.get<boolean>('enableCompletion', true);
  }

  get enableCodeLens(): boolean {
    return this.cfg.get<boolean>('enableCodeLens', true);
  }

  get enableDiagnostics(): boolean {
    return this.cfg.get<boolean>('enableDiagnostics', false);
  }

  get completionDebounce(): number {
    return this.cfg.get<number>('completionDebounce', DEFAULTS.COMPLETION_DEBOUNCE);
  }

  get maxContextTokens(): number {
    return this.cfg.get<number>('maxContextTokens', DEFAULTS.MAX_CONTEXT_TOKENS);
  }

  get autoApproveSafe(): boolean {
    return this.cfg.get<boolean>('autoApprove.safe', true);
  }

  get autoApproveLow(): boolean {
    return this.cfg.get<boolean>('autoApprove.low', true);
  }

  get notificationsApproval(): boolean {
    return this.cfg.get<boolean>('notifications.approval', true);
  }

  get language(): string {
    return this.cfg.get<string>('language', 'en');
  }

  // ─── Secrets ───────────────────────────────────────────────────────────

  async getApiKey(): Promise<string> {
    return (await this.secrets.get(SECRET_KEYS.API_KEY)) ?? '';
  }

  async setApiKey(key: string): Promise<void> {
    await this.secrets.store(SECRET_KEYS.API_KEY, key);
  }

  async clearApiKey(): Promise<void> {
    await this.secrets.delete(SECRET_KEYS.API_KEY);
  }

  // ─── Change listener ──────────────────────────────────────────────────

  onDidChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        callback();
      }
    });
  }
}
