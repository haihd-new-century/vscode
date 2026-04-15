/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { AikosState } from '../../core/state';
import { eventBus } from '../../core/event-bus';
import { logDebug } from '../../core/logger';
import { COMMANDS } from '../../constants';

interface CostMetrics {
  todayCost: number;
  todayRequests: number;
  dailyLimit?: number;
}

export class AikosStatusBar {
  private connectionItem: vscode.StatusBarItem;
  private costItem: vscode.StatusBarItem;
  private approvalItem: vscode.StatusBarItem;
  private connected = false;
  private costUpdateTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly apiClient: AikosApiClient,
    private readonly state: AikosState,
  ) {
    // Connection status (leftmost)
    this.connectionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
    this.connectionItem.command = COMMANDS.METRICS;

    // Cost tracker
    this.costItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    this.costItem.command = COMMANDS.METRICS;

    // Pending approvals badge
    this.approvalItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.approvalItem.command = COMMANDS.APPROVAL_LIST;

    this.updateConnection(false);
    this.updateCost(0, 0);
    this.updateApprovals(0);

    this.connectionItem.show();
    this.costItem.show();

    // Listen for events
    eventBus.on('connection:changed', (data) => {
      const { websocket } = data as { websocket: boolean };
      this.updateConnection(websocket);
    });

    eventBus.on('cost:updated', (data) => {
      const cost = data as CostMetrics;
      this.updateCost(cost.todayCost, cost.todayRequests, cost.dailyLimit);
    });

    eventBus.on('approval:new', () => {
      this.pendingApprovals++;
      this.updateApprovals(this.pendingApprovals);
    });

    eventBus.on('approval:resolved', () => {
      this.pendingApprovals = Math.max(0, this.pendingApprovals - 1);
      this.updateApprovals(this.pendingApprovals);
    });

    // Periodic cost refresh
    this.costUpdateTimer = setInterval(() => this.refreshCost(), 60_000);
  }

  private pendingApprovals = 0;

  updateConnection(isConnected: boolean): void {
    this.connected = isConnected;
    if (isConnected) {
      this.connectionItem.text = '$(check) AIKOS';
      this.connectionItem.tooltip = 'AIKOS: Connected';
      this.connectionItem.backgroundColor = undefined;
    } else {
      this.connectionItem.text = '$(warning) AIKOS';
      this.connectionItem.tooltip = 'AIKOS: Offline — click to view status';
      this.connectionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  private updateCost(cost: number, requests: number, limit?: number): void {
    const costStr = cost < 1 ? `${(cost * 100).toFixed(1)}¢` : `$${cost.toFixed(2)}`;
    this.costItem.text = `$(credit-card) ${costStr}`;

    let tooltip = `Today: ${costStr} (${requests} requests)`;
    if (limit) {
      const pct = ((cost / limit) * 100).toFixed(0);
      tooltip += `\nLimit: $${limit.toFixed(2)} (${pct}% used)`;
      if (cost / limit > 0.9) {
        this.costItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        this.costItem.backgroundColor = undefined;
      }
    }
    this.costItem.tooltip = tooltip;

    // Persist
    this.state.todayCost = cost;
  }

  private updateApprovals(count: number): void {
    if (count > 0) {
      this.approvalItem.text = `$(bell) ${count}`;
      this.approvalItem.tooltip = `${count} pending approval${count > 1 ? 's' : ''}`;
      this.approvalItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.approvalItem.show();
    } else {
      this.approvalItem.hide();
    }
  }

  private async refreshCost(): Promise<void> {
    if (!this.connected) return;
    try {
      const metrics = await this.apiClient.get<CostMetrics>('/metrics/cost/today');
      this.updateCost(metrics.todayCost, metrics.todayRequests, metrics.dailyLimit);
    } catch {
      logDebug('Cost refresh failed (non-critical)');
    }
  }

  dispose(): void {
    if (this.costUpdateTimer) clearInterval(this.costUpdateTimer);
    this.connectionItem.dispose();
    this.costItem.dispose();
    this.approvalItem.dispose();
  }
}
