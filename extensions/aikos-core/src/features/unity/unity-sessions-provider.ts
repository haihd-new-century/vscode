// ----------------------------------------------------------------------------
//  Sidebar TreeDataProvider for connected Unity Editor sessions.
//  Plan-10 · Sprint U3 · Task U3.4
//
//  Polls /unity/sessions every 15s, exposes pin/unpin/focus actions, shows
//  status colour based on liveness.
// ----------------------------------------------------------------------------

import * as vscode from 'vscode';
import { VIEW_IDS } from '../../constants';
import { UnityExtensionClient } from './unity-client';
import { UnitySessionState } from './unity-state';
import { UnitySessionInfo } from './unity-types';

const POLL_MS = 15_000;

class UnitySessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: UnitySessionInfo, isPinned: boolean) {
    super(session.projectName || session.id, vscode.TreeItemCollapsibleState.None);

    this.id = `unity:${session.id}`;
    const status = (session.status || 'unknown').toLowerCase();
    const themeColour =
      status === 'connected'
        ? new vscode.ThemeColor('charts.green')
        : status === 'reloading'
          ? new vscode.ThemeColor('charts.yellow')
          : new vscode.ThemeColor('charts.red');
    this.iconPath = new vscode.ThemeIcon(isPinned ? 'pinned' : 'circle-filled', themeColour);

    this.description = `${session.unityVersion || '?'} · ${status}`;
    const tip = new vscode.MarkdownString(
      `**${session.projectName || session.id}**\n\n` +
        `- Unity: \`${session.unityVersion || '?'}\`\n` +
        `- Platform: \`${session.platform || '?'}\`\n` +
        `- Status: \`${status}\`\n` +
        (session.isPlaying ? `- ▶ Playing\n` : '') +
        (session.isCompiling ? `- ⚙ Compiling\n` : '') +
        `- Path: \`${session.projectPath}\`\n` +
        (session.schemaFingerprint
          ? `- Schema: \`${session.schemaFingerprint.slice(0, 12)}\`\n`
          : '') +
        `- Last heartbeat: ${session.lastHeartbeat}\n`,
    );
    tip.isTrusted = true;
    this.tooltip = tip;
    this.contextValue = isPinned ? 'unity-session-pinned' : 'unity-session';
  }
}

export class UnitySessionsProvider
  implements vscode.TreeDataProvider<UnitySessionTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event as vscode.Event<
    UnitySessionTreeItem | undefined
  >;

  private sessions: UnitySessionInfo[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  get isEmpty(): boolean {
    return this.sessions.length === 0;
  }

  constructor(
    private readonly client: UnityExtensionClient,
    private readonly state: UnitySessionState,
  ) {}

  start(): void {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  getTreeItem(el: UnitySessionTreeItem): vscode.TreeItem {
    return el;
  }

  async getChildren(): Promise<UnitySessionTreeItem[]> {
    const pinned = this.state.pinnedSessionId;
    return this.sessions.map((s) => new UnitySessionTreeItem(s, s.id === pinned));
  }

  async refresh(): Promise<void> {
    this.sessions = await this.client.listSessions();
    this._onDidChangeTreeData.fire(undefined);
  }

  async findById(id: string): Promise<UnitySessionInfo | undefined> {
    return this.sessions.find((s) => s.id === id);
  }

  listCached(): UnitySessionInfo[] {
    return [...this.sessions];
  }
}
