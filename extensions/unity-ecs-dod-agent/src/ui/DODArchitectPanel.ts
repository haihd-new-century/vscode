// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { DataAnalysisAgent, DataAnalysisResult } from '../agents/DataAnalysisAgent';
import { ArchetypeDesignAgent } from '../agents/ArchetypeDesignAgent';
import { SystemBuilderAgent } from '../agents/SystemBuilderAgent';
import { ProjectContext, Violation } from '../analyzers/UnityProjectAnalyzer';

export class DODArchitectPanel {
	public static currentPanel: DODArchitectPanel | undefined;
	private static readonly viewType = 'unityDOD.architectPanel';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _dataAnalysis: DataAnalysisResult | undefined;
	private _dataPhaseComplete = false;
	private _disposables: vscode.Disposable[] = [];

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		private readonly _dataAgent: DataAnalysisAgent,
		private readonly _archetypeAgent: ArchetypeDesignAgent,
		private readonly _systemAgent: SystemBuilderAgent
	) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._panel.webview.html = this._getHtmlContent();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.onDidReceiveMessage(
			(message: { command: string; payload?: unknown }) => this._handleMessage(message),
			null,
			this._disposables
		);
	}

	public static createOrShow(
		extensionUri: vscode.Uri,
		dataAgent: DataAnalysisAgent,
		archetypeAgent: ArchetypeDesignAgent,
		systemAgent: SystemBuilderAgent
	): void {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (DODArchitectPanel.currentPanel) {
			DODArchitectPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			DODArchitectPanel.viewType,
			'Unity DOD Architect',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		DODArchitectPanel.currentPanel = new DODArchitectPanel(panel, extensionUri, dataAgent, archetypeAgent, systemAgent);
	}

	public updateDataAnalysis(result: DataAnalysisResult): void {
		this._dataAnalysis = result;
		this._dataPhaseComplete = result.components.length > 0;
		this._panel.webview.postMessage({ type: 'dataAnalysis', data: result });
	}

	public updateProjectContext(context: ProjectContext, violations: Violation[]): void {
		this._panel.webview.postMessage({ type: 'projectContext', data: { context, violations } });
	}

	public isDataPhaseComplete(): boolean {
		return this._dataPhaseComplete;
	}

	private async _handleMessage(message: { command: string; payload?: unknown }): Promise<void> {
		switch (message.command) {
			case 'designArchetypes': {
				if (!this._dataAnalysis) {
					vscode.window.showWarningMessage('Run Data Analysis first before designing archetypes.');
					return;
				}
				try {
					const result = await this._archetypeAgent.designArchetypes(this._dataAnalysis.components);
					this._panel.webview.postMessage({ type: 'archetypeDesign', data: result });
				} catch (err) {
					vscode.window.showErrorMessage(`Archetype design failed: ${err}`);
				}
				break;
			}
			case 'generateSystem': {
				const payload = message.payload as { archetypeName: string; description: string; archetypeComponents: string[] } | undefined;
				if (!payload) { return; }
				try {
					const archetype = {
						name: payload.archetypeName,
						components: payload.archetypeComponents,
						estimatedChunkFillRate: 0,
						notes: '',
						warnings: []
					};
					const result = await this._systemAgent.generateSystem(archetype, payload.description);
					this._panel.webview.postMessage({ type: 'generatedSystem', data: result });
				} catch (err) {
					vscode.window.showErrorMessage(`System generation failed: ${err}`);
				}
				break;
			}
		}
	}

	private _getHtmlContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Unity DOD Architect</title>
	<style>
		body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
		h1 { font-size: 1.4em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
		h2 { font-size: 1.1em; margin-top: 20px; }
		.section { margin-bottom: 24px; }
		.component-card { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; padding: 8px 12px; margin: 6px 0; }
		.warning { color: var(--vscode-editorWarning-foreground); }
		.hot { color: var(--vscode-charts-red); }
		.cold { color: var(--vscode-charts-blue); }
		button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; border-radius: 3px; cursor: pointer; margin-top: 8px; }
		button:hover { background: var(--vscode-button-hoverBackground); }
		pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow: auto; font-size: 0.9em; }
		.violation { background: var(--vscode-inputValidation-warningBackground); border-left: 3px solid var(--vscode-editorWarning-foreground); padding: 6px 10px; margin: 4px 0; border-radius: 0 4px 4px 0; }
	</style>
</head>
<body>
	<h1>&#129302; Unity DOD Architect</h1>

	<div class="section" id="phase-data">
		<h2>Phase 1: Data Analysis</h2>
		<div id="data-content"><em>Run <strong>Unity DOD: Analyze Data Layer</strong> to begin.</em></div>
	</div>

	<div class="section" id="phase-archetype">
		<h2>Phase 2: Archetype Design</h2>
		<button onclick="designArchetypes()">Design Archetypes</button>
		<div id="archetype-content"></div>
	</div>

	<div class="section" id="phase-violations">
		<h2>Project Violations</h2>
		<div id="violations-content"><em>Run <strong>Unity DOD: Scan Unity Project</strong> to detect violations.</em></div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		function designArchetypes() {
			vscode.postMessage({ command: 'designArchetypes' });
		}

		window.addEventListener('message', event => {
			const { type, data } = event.data;
			if (type === 'dataAnalysis') {
				renderDataAnalysis(data);
			} else if (type === 'archetypeDesign') {
				renderArchetypeDesign(data);
			} else if (type === 'projectContext') {
				renderViolations(data.violations);
			} else if (type === 'generatedSystem') {
				renderGeneratedSystem(data);
			}
		});

		function renderDataAnalysis(data) {
			const el = document.getElementById('data-content');
			const warnings = data.warnings.map(w => \`<div class="warning">&#9888; \${w}</div>\`).join('');
			const components = data.components.map(c => {
				const tag = c.tag === 'Hot' ? '<span class="hot">[Hot]</span>' : c.tag === 'Cold' ? '<span class="cold">[Cold]</span>' : \`[\${c.tag}]\`;
				const fields = c.fields.map(f => \`  \${f.type} \${f.name}\`).join('\\n');
				return \`<div class="component-card"><strong>\${c.name}</strong> \${tag}<pre>struct \${c.name} : IComponentData {\\n\${fields}\\n}</pre>\${c.notes ? '<em>' + c.notes + '</em>' : ''}</div>\`;
			}).join('');
			el.innerHTML = components + warnings;
		}

		function renderArchetypeDesign(data) {
			const el = document.getElementById('archetype-content');
			const archetypes = data.archetypes.map(a => \`<div class="component-card"><strong>\${a.name}</strong> (fill: \${(a.estimatedChunkFillRate * 100).toFixed(0)}%)<br>Components: \${a.components.join(', ')}<br><em>\${a.notes}</em></div>\`).join('');
			const warnings = data.warnings.map(w => \`<div class="warning">&#9888; \${w}</div>\`).join('');
			el.innerHTML = archetypes + warnings;
		}

		function renderViolations(violations) {
			const el = document.getElementById('violations-content');
			if (!violations || violations.length === 0) {
				el.innerHTML = '<em style="color: var(--vscode-testing-iconPassed)">&#10003; No DOD violations found.</em>';
				return;
			}
			el.innerHTML = violations.map(v => \`<div class="violation"><strong>[\${v.type}]</strong> \${v.message}<br><small>\${v.file}</small></div>\`).join('');
		}

		function renderGeneratedSystem(data) {
			const el = document.getElementById('archetype-content');
			el.innerHTML += \`<h3>Generated: \${data.fileName}</h3><pre>\${data.code}</pre>\`;
		}
	</script>
</body>
</html>`;
	}

	public dispose(): void {
		DODArchitectPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}
