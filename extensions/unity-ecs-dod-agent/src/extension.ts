import * as vscode from 'vscode';
import { DODArchitectPanel } from './ui/DODArchitectPanel';
import { UnityProjectAnalyzer } from './analyzers/UnityProjectAnalyzer';
import { LLMRouter } from './llm/LLMRouter';
import { DataAnalysisAgent } from './agents/DataAnalysisAgent';
import { ArchetypeDesignAgent } from './agents/ArchetypeDesignAgent';
import { SystemBuilderAgent } from './agents/SystemBuilderAgent';
import { DODRefactorAgent } from './agents/DODRefactorAgent';

export function activate(context: vscode.ExtensionContext) {
  console.log('Unity ECS DOD Agent activated');

  const llmRouter = new LLMRouter();
  const analyzer = new UnityProjectAnalyzer();
  const dataAgent = new DataAnalysisAgent(llmRouter);
  const archetypeAgent = new ArchetypeDesignAgent(llmRouter);
  const systemAgent = new SystemBuilderAgent(llmRouter);
  const refactorAgent = new DODRefactorAgent(llmRouter);

  context.subscriptions.push(
    vscode.commands.registerCommand('unityDOD.start', () => {
      DODArchitectPanel.createOrShow(context.extensionUri, dataAgent, archetypeAgent, systemAgent);
    }),

    vscode.commands.registerCommand('unityDOD.analyzeData', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Describe your gameplay features for DOD analysis',
        placeHolder: 'e.g. Player movement, enemy AI with patrol, health and damage system...'
      });
      if (!input) return;
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Analyzing data layer...' }, async () => {
        const result = await dataAgent.analyzeGameplayFeatures(input);
        DODArchitectPanel.createOrShow(context.extensionUri, dataAgent, archetypeAgent, systemAgent);
        DODArchitectPanel.currentPanel?.updateDataAnalysis(result);
      });
    }),

    vscode.commands.registerCommand('unityDOD.generateSystem', async () => {
      const config = vscode.workspace.getConfiguration('unityDOD');
      const enforce = config.get<boolean>('workflow.enforceDataFirstApproach', true);
      if (enforce && !DODArchitectPanel.currentPanel?.isDataPhaseComplete()) {
        vscode.window.showWarningMessage(
          'DOD First Approach: Please complete Data Analysis and Archetype Design before generating Systems.',
          'Open DOD Architect'
        ).then(action => {
          if (action) vscode.commands.executeCommand('unityDOD.start');
        });
        return;
      }
      vscode.commands.executeCommand('unityDOD.start');
    }),

    vscode.commands.registerCommand('unityDOD.refactorToECS', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      if (!selectedText) {
        vscode.window.showInformationMessage('Please select the OOP code to refactor to ECS.');
        return;
      }
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Refactoring to Unity ECS...' }, async () => {
        const result = await refactorAgent.refactorOOPtoECS(selectedText);
        const doc = await vscode.workspace.openTextDocument({ content: result.refactoredCode, language: 'csharp' });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      });
    }),

    vscode.commands.registerCommand('unityDOD.scanProject', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders) return;
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Scanning Unity project...' }, async () => {
        const ctx = await analyzer.scanProject(folders[0].uri.fsPath);
        const violations = analyzer.detectDODViolations(ctx);
        if (violations.length > 0) {
          vscode.window.showWarningMessage(`Found ${violations.length} DOD violations. Check the DOD Architect panel.`);
        } else {
          vscode.window.showInformationMessage('Project scan complete. No DOD violations found!');
        }
        DODArchitectPanel.currentPanel?.updateProjectContext(ctx, violations);
      });
    })
  );
}

export function deactivate() { }
