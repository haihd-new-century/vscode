import * as vscode from 'vscode';

/**
 * Persistent state manager using VS Code Memento.
 * globalState persists across workspaces, workspaceState is per-workspace.
 */
export class AikosState {
  private global: vscode.Memento;
  private workspace: vscode.Memento;

  constructor(context: vscode.ExtensionContext) {
    this.global = context.globalState;
    this.workspace = context.workspaceState;
  }

  // ─── Global State (across workspaces) ────────────────────────────────

  get activeConversationId(): string | undefined {
    return this.global.get<string>('activeConversationId');
  }

  set activeConversationId(id: string | undefined) {
    this.global.update('activeConversationId', id);
  }

  get recentSearches(): string[] {
    return this.global.get<string[]>('recentSearches', []);
  }

  addRecentSearch(query: string): void {
    const searches = this.recentSearches.filter(s => s !== query);
    searches.unshift(query);
    this.global.update('recentSearches', searches.slice(0, 20));
  }

  get todayCost(): number {
    const stored = this.global.get<{ date: string; cost: number }>('todayCost');
    const today = new Date().toISOString().slice(0, 10);
    if (stored && stored.date === today) return stored.cost;
    return 0;
  }

  set todayCost(cost: number) {
    const today = new Date().toISOString().slice(0, 10);
    this.global.update('todayCost', { date: today, cost });
  }

  // ─── Workspace State (per workspace) ─────────────────────────────────

  get selectedCollection(): string | undefined {
    return this.workspace.get<string>('selectedCollection');
  }

  set selectedCollection(id: string | undefined) {
    this.workspace.update('selectedCollection', id);
  }

  get selectedModel(): string | undefined {
    return this.workspace.get<string>('selectedModel');
  }

  set selectedModel(id: string | undefined) {
    this.workspace.update('selectedModel', id);
  }

  // ─── Offline Mode ────────────────────────────────────────────────────

  get isOffline(): boolean {
    return this.global.get<boolean>('isOffline', false);
  }

  set isOffline(offline: boolean) {
    this.global.update('isOffline', offline);
  }

  // ─── Offline Cache ───────────────────────────────────────────────────

  getCached<T>(key: string): T | undefined {
    const entry = this.global.get<{ data: T; cachedAt: number }>(`cache:${key}`);
    if (!entry) return undefined;
    // Cache valid for 1 hour
    if (Date.now() - entry.cachedAt > 3_600_000) return undefined;
    return entry.data;
  }

  setCache<T>(key: string, data: T): void {
    this.global.update(`cache:${key}`, { data, cachedAt: Date.now() });
  }
}
