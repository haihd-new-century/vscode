/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosWebSocket } from '../../core/websocket';
import { eventBus } from '../../core/event-bus';
import { logInfo, logDebug } from '../../core/logger';

/**
 * TaskTracker: subscribes to WebSocket events for specific tasks
 * and forwards real-time updates to the event bus.
 */
export class TaskTracker {
  private trackedTasks = new Set<string>();

  constructor(private readonly ws: AikosWebSocket) {
    // Listen for task completion to stop tracking
    eventBus.on('task:completed', (data) => {
      const { id } = data as { id: string };
      if (this.trackedTasks.has(id)) {
        this.trackedTasks.delete(id);
        logDebug(`Stopped tracking task ${id}`);
      }
    });
  }

  /**
   * Start tracking a task via WebSocket subscription.
   */
  track(taskId: string): void {
    if (this.trackedTasks.has(taskId)) return;

    this.trackedTasks.add(taskId);
    this.ws.subscribe('job', taskId);
    logInfo(`Tracking task ${taskId}`);
  }

  /**
   * Stop tracking a specific task.
   */
  untrack(taskId: string): void {
    this.trackedTasks.delete(taskId);
  }

  /**
   * Stop tracking all tasks.
   */
  untrackAll(): void {
    this.trackedTasks.clear();
  }

  get trackedCount(): number {
    return this.trackedTasks.size;
  }
}

export function registerTaskTracker(
  context: vscode.ExtensionContext,
  ws: AikosWebSocket,
): TaskTracker {
  const tracker = new TaskTracker(ws);
  context.subscriptions.push({ dispose: () => tracker.untrackAll() });
  return tracker;
}
