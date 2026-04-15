// ----------------------------------------------------------------------------
//  Pinned Unity session state, persisted in workspaceState.
//  Consumed by the chat picker (`@unity:slug`) and the agent runtime adapter.
// ----------------------------------------------------------------------------

import * as vscode from 'vscode';

const KEY_PINNED = 'aikos.unity.pinnedSessionId';

export class UnitySessionState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get pinnedSessionId(): string | undefined {
    return this.context.workspaceState.get<string>(KEY_PINNED);
  }

  async pin(sessionId: string): Promise<void> {
    await this.context.workspaceState.update(KEY_PINNED, sessionId);
  }

  async unpin(): Promise<void> {
    await this.context.workspaceState.update(KEY_PINNED, undefined);
  }
}
