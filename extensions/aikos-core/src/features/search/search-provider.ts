/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient, Citation } from '../../core/api-client';
import { AikosState } from '../../core/state';
import { logError, logDebug } from '../../core/logger';
import { VIEW_IDS } from '../../constants';

// ─── TreeItem ─────────────────────────────────────────────────────────────

class SearchResultItem extends vscode.TreeItem {
  constructor(public readonly result: Citation) {
    super(result.document_name || `Chunk ${result.chunk_id}`, vscode.TreeItemCollapsibleState.None);

    this.description = `${(result.score * 100).toFixed(0)}% match`;
    this.tooltip = new vscode.MarkdownString(
      `**${result.document_name || result.chunk_id}**\n\n` +
      (result.page_number ? `Page ${result.page_number}\n\n` : '') +
      `${result.content.slice(0, 300)}${result.content.length > 300 ? '...' : ''}\n\n` +
      `Score: ${(result.score * 100).toFixed(1)}%`,
    );

    this.iconPath = new vscode.ThemeIcon(
      result.type === 'image' ? 'file-media' :
      result.type === 'table' ? 'table' : 'file-text',
    );

    this.command = {
      command: `${VIEW_IDS.SEARCH}.open`,
      title: 'View Result',
      arguments: [result],
    };
  }
}

class SearchHistoryItem extends vscode.TreeItem {
  constructor(public readonly query: string) {
    super(query, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('history');
    this.command = {
      command: `${VIEW_IDS.SEARCH}.rerun`,
      title: 'Search again',
      arguments: [query],
    };
  }
}

type SearchTreeItem = SearchResultItem | SearchHistoryItem;

// ─── Provider ─────────────────────────────────────────────────────────────

export class SearchTreeProvider implements vscode.TreeDataProvider<SearchTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SearchTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private results: Citation[] = [];

  get isEmpty(): boolean {
    return this.results.length === 0 && this.state.recentSearches.length === 0;
  }

  constructor(
    private readonly apiClient: AikosApiClient,
    private readonly state: AikosState,
  ) {}

  getTreeItem(element: SearchTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SearchTreeItem): SearchTreeItem[] {
    if (element) return [];

    // Show results if we have them, otherwise show recent searches
    if (this.results.length > 0) {
      return this.results.map(r => new SearchResultItem(r));
    }

    const recent = this.state.recentSearches;
    if (recent.length > 0) {
      return recent.slice(0, 10).map(q => new SearchHistoryItem(q));
    }

    return [];
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) return;

    this.state.addRecentSearch(query);

    try {
      logDebug(`Searching: ${query}`);
      const response = await this.apiClient.post<{ results: Citation[] }>('/search', {
        query,
        collectionId: this.state.selectedCollection,
        limit: 20,
      });

      this.results = response.results || [];
      logDebug(`Found ${this.results.length} results`);
    } catch (err) {
      logError('Search failed', err);
      this.results = [];
      vscode.window.showErrorMessage('Search failed. Check your connection.');
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  clearResults(): void {
    this.results = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  async openResult(result: Citation): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: `# ${result.document_name || 'Search Result'}\n\n` +
        (result.page_number ? `Page: ${result.page_number}\n` : '') +
        `Score: ${(result.score * 100).toFixed(1)}%\n` +
        `Type: ${result.type || 'text'}\n\n---\n\n${result.content}`,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export function registerSearchView(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
  state: AikosState,
): SearchTreeProvider {
  const provider = new SearchTreeProvider(apiClient, state);

  const treeView = vscode.window.createTreeView(VIEW_IDS.SEARCH, { treeDataProvider: provider });
  treeView.message = 'Search your knowledge base using Ctrl+Shift+K.';
  provider.onDidChangeTreeData(() => {
    treeView.message = provider.isEmpty ? 'Search your knowledge base using Ctrl+Shift+K.' : undefined;
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(`${VIEW_IDS.SEARCH}.open`, (result: Citation) =>
      provider.openResult(result),
    ),
    vscode.commands.registerCommand(`${VIEW_IDS.SEARCH}.rerun`, (query: string) =>
      provider.search(query),
    ),
    vscode.commands.registerCommand(`${VIEW_IDS.SEARCH}.clear`, () => provider.clearResults()),
  );

  return provider;
}
