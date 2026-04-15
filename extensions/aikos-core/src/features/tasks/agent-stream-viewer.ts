/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient, AgentSSEEvent } from '../../core/api-client';
import { logInfo, logError } from '../../core/logger';

/**
 * Agent Stream Viewer: shows real-time agent execution progress
 * in an output channel with step-by-step updates.
 */
export class AgentStreamViewer {
  private outputChannel: vscode.OutputChannel;

  constructor(private readonly apiClient: AikosApiClient) {
    this.outputChannel = vscode.window.createOutputChannel('AIKOS Agent', 'markdown');
  }

  /**
   * Stream an agent task and display progress in real-time.
   */
  async streamTask(params: {
    query: string;
    collectionId?: string;
    model?: string;
    enableReasoning?: boolean;
  }): Promise<void> {
    this.outputChannel.show();
    this.outputChannel.appendLine(`\n${'═'.repeat(60)}`);
    this.outputChannel.appendLine(`# Agent Task`);
    this.outputChannel.appendLine(`Query: ${params.query}`);
    this.outputChannel.appendLine(`Time: ${new Date().toLocaleString()}`);
    this.outputChannel.appendLine(`${'─'.repeat(60)}`);
    this.outputChannel.appendLine('');

    let currentStep = '';

    try {
      for await (const event of this.apiClient.agentStream(params)) {
        this.handleEvent(event, currentStep);
        if (event.type === 'step_start' && event.agent_type) {
          currentStep = event.agent_type;
        }
      }

      this.outputChannel.appendLine(`\n${'─'.repeat(60)}`);
      this.outputChannel.appendLine('✓ Agent task completed');
      logInfo('Agent stream completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`\n✗ Error: ${message}`);
      logError('Agent stream failed', err);
      vscode.window.showErrorMessage(`Agent task failed: ${message}`);
    }
  }

  private handleEvent(event: AgentSSEEvent, currentStep: string): void {
    switch (event.type) {
      case 'step_start':
        this.outputChannel.appendLine(`\n## Step: ${event.agent_type || 'unknown'}`);
        this.outputChannel.appendLine(`Started at ${new Date().toLocaleTimeString()}`);
        this.outputChannel.appendLine('');
        break;

      case 'step_complete':
        this.outputChannel.appendLine(`\n✓ Step "${event.agent_type || currentStep}" completed`);
        break;

      case 'thinking':
        // Show reasoning/thinking in a distinct section
        if (event.content) {
          this.outputChannel.append(`💭 ${event.content}`);
        }
        break;

      case 'todo':
        // Show task updates
        if (event.todo) {
          const icon = event.todo.status === 'done' ? '✅' :
                       event.todo.status === 'failed' ? '❌' :
                       event.todo.status === 'in_progress' ? '🔄' : '📋';
          const progress = event.todo.progress != null ? ` (${event.todo.progress}%)` : '';
          this.outputChannel.appendLine(`${icon} [${event.todo.action}] ${event.todo.title}${progress}`);
        }
        break;

      case 'delta':
        if (event.content) {
          this.outputChannel.append(event.content);
        }
        break;

      case 'sources':
        if (event.sources && event.sources.length > 0) {
          this.outputChannel.appendLine('\n\n### Sources');
          for (const src of event.sources) {
            this.outputChannel.appendLine(
              `- ${src.document_name || src.chunk_id} (score: ${(src.score * 100).toFixed(0)}%)`,
            );
          }
        }
        break;

      case 'error':
        this.outputChannel.appendLine(`\n⚠ Error: ${event.error}`);
        break;

      case 'done':
        break;
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function registerAgentStreamViewer(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): AgentStreamViewer {
  const viewer = new AgentStreamViewer(apiClient);
  context.subscriptions.push({ dispose: () => viewer.dispose() });
  return viewer;
}
