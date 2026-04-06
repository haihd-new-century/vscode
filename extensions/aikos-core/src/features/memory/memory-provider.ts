import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logError, logDebug } from '../../core/logger';
import { VIEW_IDS } from '../../constants';

// ─── Types ────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  content: string;
  type: 'episodic' | 'semantic' | 'procedural';
  score?: number;
  taskId?: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── TreeItem ─────────────────────────────────────────────────────────────

class MemoryTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: MemoryEntry) {
    super(
      entry.content.slice(0, 60).replace(/\n/g, ' '),
      vscode.TreeItemCollapsibleState.None,
    );

    this.id = entry.id;
    this.description = `${entry.type}${entry.score != null ? ` · ${(entry.score * 100).toFixed(0)}%` : ''}`;
    this.tooltip = new vscode.MarkdownString(
      `**Memory Entry**\n\n` +
      `${entry.content}\n\n` +
      `- Type: \`${entry.type}\`\n` +
      (entry.score != null ? `- Score: ${(entry.score * 100).toFixed(0)}%\n` : '') +
      (entry.agentType ? `- Agent: \`${entry.agentType}\`\n` : '') +
      `- Created: ${new Date(entry.createdAt).toLocaleString()}\n`,
    );

    const iconMap: Record<string, string> = {
      episodic: 'history',
      semantic: 'symbol-keyword',
      procedural: 'symbol-method',
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[entry.type] || 'note');
    this.contextValue = 'memory-entry';

    this.command = {
      command: 'aikos.memory.view',
      title: 'View Memory Entry',
      arguments: [entry],
    };
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  entries: MemoryEntry[] = [];
  private searchQuery?: string;

  constructor(private readonly apiClient: AikosApiClient) {}

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): MemoryTreeItem[] {
    return this.entries.map(e => new MemoryTreeItem(e));
  }

  async refresh(): Promise<void> {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (this.searchQuery) params.query = this.searchQuery;
      this.entries = await this.apiClient.get<MemoryEntry[]>('/memory', params);
      logDebug(`Loaded ${this.entries.length} memory entries`);
    } catch (err) {
      logError('Failed to load memory entries', err);
      this.entries = [];
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  async search(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search agent memory',
      placeHolder: 'e.g., authentication flow, database config...',
    });
    if (query === undefined) return; // cancelled
    this.searchQuery = query || undefined;
    await this.refresh();
  }

  clearSearch(): void {
    this.searchQuery = undefined;
    this.refresh();
  }

  async deleteEntry(id: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Delete this memory entry?', 'Delete', 'Cancel',
    );
    if (confirm !== 'Delete') return;

    try {
      await this.apiClient.del(`/memory/${id}`);
      vscode.window.showInformationMessage('Memory entry deleted.');
      await this.refresh();
    } catch (err) {
      logError('Failed to delete memory entry', err);
      vscode.window.showErrorMessage('Failed to delete memory entry');
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

// ─── View Entry ───────────────────────────────────────────────────────────

function viewMemoryEntry(entry: MemoryEntry): void {
  const content = [
    `# Memory Entry`,
    ``,
    `**Type:** ${entry.type}`,
    entry.score != null ? `**Score:** ${(entry.score * 100).toFixed(0)}%` : '',
    entry.agentType ? `**Agent:** ${entry.agentType}` : '',
    `**Created:** ${new Date(entry.createdAt).toLocaleString()}`,
    ``,
    `---`,
    ``,
    entry.content,
    ``,
    entry.metadata ? `\n---\n\n\`\`\`json\n${JSON.stringify(entry.metadata, null, 2)}\n\`\`\`` : '',
  ].filter(Boolean).join('\n');

  vscode.workspace.openTextDocument({ content, language: 'markdown' })
    .then(doc => vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside }));
}

// ─── Register ─────────────────────────────────────────────────────────────

export function registerMemoryView(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): MemoryTreeProvider {
  const provider = new MemoryTreeProvider(apiClient);

  const treeView = vscode.window.createTreeView(VIEW_IDS.MEMORY, { treeDataProvider: provider });
  treeView.message = 'No memory entries found.';
  provider.onDidChangeTreeData(() => {
    treeView.message = provider.entries.length === 0 ? 'No memory entries found.' : undefined;
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(`${VIEW_IDS.MEMORY}.refresh`, () => provider.refresh()),
    vscode.commands.registerCommand('aikos.memory.search', () => provider.search()),
    vscode.commands.registerCommand('aikos.memory.clear', () => provider.clearSearch()),
    vscode.commands.registerCommand('aikos.memory.view', (entry: MemoryEntry) => viewMemoryEntry(entry)),
    vscode.commands.registerCommand('aikos.memory.delete', (item: MemoryTreeItem) => {
      if (item?.entry) provider.deleteEntry(item.entry.id);
    }),
  );

  provider.refresh();
  return provider;
}
