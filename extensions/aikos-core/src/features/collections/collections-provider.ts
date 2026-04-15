/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { AikosState } from '../../core/state';
import { logError, logDebug } from '../../core/logger';
import { VIEW_IDS } from '../../constants';

// ─── Types ────────────────────────────────────────────────────────────────

interface Collection {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks?: number;
  embeddingModel?: string;
  createdAt: string;
}

interface Document {
  id: string;
  name: string;
  collectionId: string;
  chunkCount: number;
  fileType?: string;
  createdAt: string;
}

interface Chunk {
  id: string;
  documentId: string;
  content: string;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

// ─── TreeItems ────────────────────────────────────────────────────────────

type CollectionTreeElement = CollectionTreeItem | DocumentTreeItem | ChunkTreeItem;

class CollectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly collection: Collection,
    isSelected: boolean,
  ) {
    super(
      collection.name,
      collection.documentCount > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = `col:${collection.id}`;
    this.description = `${collection.documentCount} docs`;
    this.tooltip = new vscode.MarkdownString(
      `**${collection.name}**\n\n` +
      (collection.description ? `${collection.description}\n\n` : '') +
      `- Documents: ${collection.documentCount}\n` +
      (collection.totalChunks != null ? `- Chunks: ${collection.totalChunks}\n` : '') +
      (collection.embeddingModel ? `- Model: \`${collection.embeddingModel}\`\n` : '') +
      `- Created: ${new Date(collection.createdAt).toLocaleString()}\n`,
    );

    this.iconPath = isSelected
      ? new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('database');

    this.contextValue = isSelected ? 'collection-selected' : 'collection';
  }
}

class DocumentTreeItem extends vscode.TreeItem {
  constructor(public readonly doc: Document) {
    super(
      doc.name,
      doc.chunkCount > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = `doc:${doc.id}`;
    this.description = `${doc.chunkCount} chunks`;
    this.tooltip = new vscode.MarkdownString(
      `**${doc.name}**\n\n` +
      `- Chunks: ${doc.chunkCount}\n` +
      (doc.fileType ? `- Type: ${doc.fileType}\n` : '') +
      `- Created: ${new Date(doc.createdAt).toLocaleString()}\n`,
    );

    const iconMap: Record<string, string> = {
      pdf: 'file-pdf', image: 'file-media', csv: 'file-text',
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[doc.fileType || ''] || 'file-text');
    this.contextValue = 'document';
  }
}

class ChunkTreeItem extends vscode.TreeItem {
  constructor(public readonly chunk: Chunk, index: number) {
    super(`Chunk #${index + 1}`, vscode.TreeItemCollapsibleState.None);

    this.id = `chunk:${chunk.id}`;
    this.description = chunk.content.slice(0, 60).replace(/\n/g, ' ') + '...';
    this.tooltip = new vscode.MarkdownString(
      `**Chunk ${index + 1}**\n\n` +
      (chunk.pageNumber ? `Page: ${chunk.pageNumber}\n\n` : '') +
      '```\n' + chunk.content.slice(0, 500) + '\n```',
    );
    this.iconPath = new vscode.ThemeIcon('symbol-text');
    this.contextValue = 'chunk';

    this.command = {
      command: 'aikos.collections.viewChunk',
      title: 'View Chunk',
      arguments: [chunk],
    };
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────

export class CollectionsTreeProvider implements vscode.TreeDataProvider<CollectionTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CollectionTreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collections: Collection[] = [];

  get isEmpty(): boolean {
    return this.collections.length === 0;
  }

  constructor(
    private readonly apiClient: AikosApiClient,
    private readonly state: AikosState,
  ) {}

  getTreeItem(element: CollectionTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CollectionTreeElement): Promise<CollectionTreeElement[]> {
    if (!element) {
      const selected = this.state.selectedCollection;
      return this.collections.map(c => new CollectionTreeItem(c, c.id === selected));
    }

    if (element instanceof CollectionTreeItem) {
      try {
        const docs = await this.apiClient.get<Document[]>(
          `/collections/${element.collection.id}/documents`,
        );
        return docs.map(d => new DocumentTreeItem(d));
      } catch (err) {
        logError('Failed to load documents', err);
        return [];
      }
    }

    if (element instanceof DocumentTreeItem) {
      try {
        const chunks = await this.apiClient.get<Chunk[]>(
          `/documents/${element.doc.id}/chunks`,
        );
        return chunks.map((c, i) => new ChunkTreeItem(c, i));
      } catch (err) {
        logError('Failed to load chunks', err);
        return [];
      }
    }

    return [];
  }

  async refresh(): Promise<void> {
    try {
      this.collections = await this.apiClient.get<Collection[]>('/collections');
      logDebug(`Loaded ${this.collections.length} collections`);
    } catch (err) {
      logError('Failed to load collections', err);
      this.collections = [];
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  selectCollection(id: string): void {
    const current = this.state.selectedCollection;
    this.state.selectedCollection = current === id ? undefined : id;
    this._onDidChangeTreeData.fire(undefined);
    const name = this.collections.find(c => c.id === id)?.name || id;
    if (this.state.selectedCollection) {
      vscode.window.showInformationMessage(`Collection selected: ${name}`);
    } else {
      vscode.window.showInformationMessage('Collection deselected');
    }
  }

  async addFile(uri: vscode.Uri): Promise<void> {
    const collectionId = this.state.selectedCollection;
    if (!collectionId) {
      vscode.window.showWarningMessage('Select a collection first.');
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const fileName = uri.path.split('/').pop() || 'unknown';
      await this.apiClient.post(`/collections/${collectionId}/documents`, {
        name: fileName,
        content: Buffer.from(content).toString('utf-8'),
        metadata: { source: 'vscode', path: uri.fsPath },
      });
      vscode.window.showInformationMessage(`Added ${fileName} to collection.`);
      await this.refresh();
    } catch (err) {
      logError('Failed to add file to collection', err);
      vscode.window.showErrorMessage('Failed to add file to collection');
    }
  }

  async addFolder(uri: vscode.Uri): Promise<void> {
    const collectionId = this.state.selectedCollection;
    if (!collectionId) {
      vscode.window.showWarningMessage('Select a collection first.');
      return;
    }

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      let count = 0;
      for (const [name, type] of entries) {
        if (type === vscode.FileType.File) {
          const fileUri = vscode.Uri.joinPath(uri, name);
          const content = await vscode.workspace.fs.readFile(fileUri);
          await this.apiClient.post(`/collections/${collectionId}/documents`, {
            name,
            content: Buffer.from(content).toString('utf-8'),
            metadata: { source: 'vscode', path: fileUri.fsPath },
          });
          count++;
        }
      }
      vscode.window.showInformationMessage(`Added ${count} files to collection.`);
      await this.refresh();
    } catch (err) {
      logError('Failed to add folder to collection', err);
      vscode.window.showErrorMessage('Failed to add folder to collection');
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

// ─── Chunk Viewer ─────────────────────────────────────────────────────────

function viewChunk(chunk: Chunk): void {
  vscode.workspace.openTextDocument({ content: chunk.content, language: 'markdown' })
    .then(doc => vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside }));
}

// ─── Register ─────────────────────────────────────────────────────────────

export function registerCollectionsView(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
  state: AikosState,
): CollectionsTreeProvider {
  const provider = new CollectionsTreeProvider(apiClient, state);

  const treeView = vscode.window.createTreeView(VIEW_IDS.COLLECTIONS, { treeDataProvider: provider });
  treeView.message = 'No collections found. Connect to AIKOS API to load collections.';
  provider.onDidChangeTreeData(() => {
    treeView.message = provider.isEmpty ? 'No collections found. Connect to AIKOS API to load collections.' : undefined;
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(`${VIEW_IDS.COLLECTIONS}.refresh`, () => provider.refresh()),
    vscode.commands.registerCommand(`${VIEW_IDS.COLLECTIONS}.select`, (id: string) =>
      provider.selectCollection(id),
    ),
    vscode.commands.registerCommand('aikos.collections.viewChunk', (chunk: Chunk) => viewChunk(chunk)),
  );

  provider.refresh();
  return provider;
}
