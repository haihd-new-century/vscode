/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Agent Manager View Pane
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAgentManagerService, IAgentTask } from './agentManagerService.js';
import * as dom from '../../../../base/browser/dom.js';

export class AgentManagerViewPane extends ViewPane {

	private _taskListElement: HTMLElement | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAgentManagerService private readonly _agentManagerService: IAgentManagerService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this._agentManagerService.onDidChangeTasks(() => this._renderTasks()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('agent-manager-view');

		// Header
		const header = dom.append(container, dom.$('.agent-manager-header'));
		const title = dom.append(header, dom.$('h3'));
		title.textContent = localize('agentManagerTitle', 'AIKOS Agent Manager');

		const submitBtn = dom.append(header, dom.$('button.agent-manager-submit'));
		submitBtn.textContent = localize('submitTask', '+ New Task');
		this._register(dom.addDisposableListener(submitBtn, 'click', () => {
			// TODO: Show input dialog for task description
		}));

		// Task list
		this._taskListElement = dom.append(container, dom.$('.agent-manager-task-list'));

		// Empty state
		this._renderTasks();
	}

	private _renderTasks(): void {
		if (!this._taskListElement) return;

		dom.clearNode(this._taskListElement);

		const tasks = this._agentManagerService.getTasks();

		if (tasks.length === 0) {
			const emptyState = dom.append(this._taskListElement, dom.$('.agent-manager-empty'));
			emptyState.textContent = localize('noTasks', 'No agent tasks yet. Submit a task to get started.');
			return;
		}

		// Group by status
		const groups: Record<string, IAgentTask[]> = {
			running: [],
			paused: [],
			pending: [],
			completed: [],
			failed: [],
		};

		for (const task of tasks) {
			(groups[task.status] || groups['pending']).push(task);
		}

		for (const [status, statusTasks] of Object.entries(groups)) {
			if (statusTasks.length === 0) continue;

			const groupEl = dom.append(this._taskListElement, dom.$('.agent-manager-group'));

			const groupHeader = dom.append(groupEl, dom.$('.agent-manager-group-header'));
			const statusIcons: Record<string, string> = {
				running: '\u25CF', // ●
				paused: '\u275A\u275A', // ❚❚
				pending: '\u25CB', // ○
				completed: '\u2713', // ✓
				failed: '\u2717', // ✗
			};
			groupHeader.textContent = `${statusIcons[status] || ''} ${status.toUpperCase()} (${statusTasks.length})`;

			for (const task of statusTasks) {
				const taskEl = dom.append(groupEl, dom.$('.agent-manager-task-item'));

				const taskTitle = dom.append(taskEl, dom.$('.task-title'));
				taskTitle.textContent = `#${task.id.slice(-4)} ${task.description}`;

				if (task.currentStep) {
					const stepEl = dom.append(taskEl, dom.$('.task-step'));
					stepEl.textContent = `Step ${task.currentStepIndex || 0}/${task.totalSteps || 0} — ${task.currentStep}`;
				}

				if (task.cost !== undefined) {
					const costEl = dom.append(taskEl, dom.$('.task-cost'));
					costEl.textContent = `$${task.cost.toFixed(4)}`;
				}

				// Progress bar for running tasks
				if (task.status === 'running' && task.progress > 0) {
					const progressContainer = dom.append(taskEl, dom.$('.task-progress'));
					const progressBar = dom.append(progressContainer, dom.$('.task-progress-bar'));
					progressBar.style.width = `${task.progress}%`;
				}
			}
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		// Layout adjustments if needed
	}
}
