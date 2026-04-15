/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AikosApiClient } from '../../core/api-client';
import { logError, logInfo } from '../../core/logger';

// ─── Types ────────────────────────────────────────────────────────────────

interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: number;
  lastRun?: string;
  status?: 'idle' | 'running' | 'completed' | 'failed';
}

// ─── Workflow Panel ───────────────────────────────────────────────────────

export class WorkflowPanel {
  private outputChannel: vscode.OutputChannel;

  constructor(private readonly apiClient: AikosApiClient) {
    this.outputChannel = vscode.window.createOutputChannel('AIKOS Workflows', 'markdown');
  }

  async showAndPick(): Promise<void> {
    try {
      const workflows = await this.apiClient.get<Workflow[]>('/workflows');

      if (workflows.length === 0) {
        vscode.window.showInformationMessage('No workflows available.');
        return;
      }

      const items = workflows.map(w => ({
        label: w.name,
        description: `${w.steps} steps${w.status === 'running' ? ' (running)' : ''}`,
        detail: w.description,
        workflow: w,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a workflow to execute',
      });

      if (picked) {
        await this.execute(picked.workflow);
      }
    } catch (err) {
      logError('Failed to load workflows', err);
      vscode.window.showErrorMessage('Failed to load workflows');
    }
  }

  private async execute(workflow: Workflow): Promise<void> {
    const confirm = await vscode.window.showInformationMessage(
      `Execute workflow "${workflow.name}" (${workflow.steps} steps)?`,
      'Execute',
      'Cancel',
    );
    if (confirm !== 'Execute') return;

    this.outputChannel.show();
    this.outputChannel.appendLine(`\n${'═'.repeat(50)}`);
    this.outputChannel.appendLine(`# Workflow: ${workflow.name}`);
    this.outputChannel.appendLine(`Started: ${new Date().toLocaleString()}`);
    this.outputChannel.appendLine(`${'─'.repeat(50)}\n`);

    try {
      const result = await this.apiClient.post<{ executionId: string; status: string }>(
        `/workflows/${workflow.id}/execute`,
      );

      this.outputChannel.appendLine(`Execution ID: ${result.executionId}`);
      this.outputChannel.appendLine(`Status: ${result.status}`);
      this.outputChannel.appendLine(`\n✓ Workflow submitted successfully`);

      logInfo(`Workflow ${workflow.name} submitted: ${result.executionId}`);
      vscode.window.showInformationMessage(`Workflow "${workflow.name}" submitted.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`\n✗ Error: ${msg}`);
      logError('Workflow execution failed', err);
      vscode.window.showErrorMessage(`Workflow failed: ${msg}`);
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function registerWorkflowPanel(
  context: vscode.ExtensionContext,
  apiClient: AikosApiClient,
): WorkflowPanel {
  const panel = new WorkflowPanel(apiClient);
  context.subscriptions.push({ dispose: () => panel.dispose() });
  return panel;
}
