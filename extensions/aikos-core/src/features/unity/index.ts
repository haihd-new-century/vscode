/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ----------------------------------------------------------------------------
//  Unity sidebar registration entry-point.
//  Wired into extension.ts via registerUnitySessionsView().
// ----------------------------------------------------------------------------

import * as vscode from 'vscode';
import { COMMANDS, VIEW_IDS } from '../../constants';
import { AikosApiClient } from '../../core/api-client';
import { UnityExtensionClient } from './unity-client';
import { UnitySessionsProvider } from './unity-sessions-provider';
import { UnitySessionState } from './unity-state';
import { UnitySessionInfo } from './unity-types';
import { registerInstallMcpCommand } from './install-mcp-package';

export { UnityExtensionClient, UnitySessionsProvider, UnitySessionState };
export type { UnitySessionInfo };

export interface UnityFeature {
  client: UnityExtensionClient;
  state: UnitySessionState;
  provider: UnitySessionsProvider;
  dispose(): void;
}

export function registerUnitySessionsView(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): UnityFeature {
  const client = new UnityExtensionClient(apiClient);
  const state = new UnitySessionState(context);
  const provider = new UnitySessionsProvider(client, state);

  const treeView = vscode.window.createTreeView(VIEW_IDS.UNITY_SESSIONS, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  treeView.message = 'No Unity Editor sessions detected. Open Unity ▸ Window ▸ AIKOS ▸ MCP Bridge.';
  provider.onDidChangeTreeData(() => {
    treeView.message = provider.isEmpty
      ? 'No Unity Editor sessions detected. Open Unity ▸ Window ▸ AIKOS ▸ MCP Bridge.'
      : undefined;
  });

  // ── Commands ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(COMMANDS.UNITY_REFRESH, () => provider.refresh()),

    vscode.commands.registerCommand(
      COMMANDS.UNITY_PIN,
      async (item?: { session?: UnitySessionInfo }) => {
        const session = item?.session ?? (await pickSession(provider));
        if (!session) return;
        await state.pin(session.id);
        vscode.window.showInformationMessage(
          `Pinned Unity session: ${session.projectName || session.id}`,
        );
        provider.refresh();
      },
    ),

    vscode.commands.registerCommand(COMMANDS.UNITY_UNPIN, async () => {
      await state.unpin();
      vscode.window.showInformationMessage('Unpinned Unity session');
      provider.refresh();
    }),

    vscode.commands.registerCommand(
      COMMANDS.UNITY_FOCUS,
      async (item?: { session?: UnitySessionInfo }) => {
        const session = item?.session ?? (await pickSession(provider));
        if (!session) return;
        try {
          await client.invoke(session.id, 'menu.execute', { menuPath: 'Window/General/Project' });
          vscode.window.showInformationMessage(`Focused ${session.projectName}`);
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to focus Unity: ${(err as Error).message ?? err}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      COMMANDS.UNITY_INVOKE_PING,
      async (item?: { session?: UnitySessionInfo }) => {
        const session = item?.session ?? (await pickSession(provider));
        if (!session) return;
        try {
          const result = await client.invoke<{ pong: boolean; editorTime: number }>(
            session.id,
            'ping',
          );
          vscode.window.showInformationMessage(
            `Unity ping ok — editorTime=${result?.editorTime?.toFixed?.(2) ?? '?'}`,
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Ping failed: ${(err as Error).message ?? err}`);
        }
      },
    ),

    vscode.commands.registerCommand(COMMANDS.UNITY_OPEN_DASHBOARD, () => {
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000/dashboard/unity'));
    }),
  );

  void registerInstallMcpCommand(context).then((items) => {
    items.forEach((d) => context.subscriptions.push(d));
  });

  provider.start();

  return {
    client,
    state,
    provider,
    dispose: () => provider.stop(),
  };
}

async function pickSession(
  provider: UnitySessionsProvider,
): Promise<UnitySessionInfo | undefined> {
  const sessions = provider.listCached();
  if (sessions.length === 0) {
    vscode.window.showWarningMessage('No Unity Editor sessions connected.');
    return undefined;
  }
  if (sessions.length === 1) return sessions[0];
  const pick = await vscode.window.showQuickPick(
    sessions.map((s) => ({
      label: s.projectName || s.id,
      description: `${s.unityVersion} · ${s.status}`,
      detail: s.projectPath,
      session: s,
    })),
    { placeHolder: 'Select a Unity session' },
  );
  return pick?.session;
}
