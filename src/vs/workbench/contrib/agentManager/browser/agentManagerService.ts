/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Agent Manager Service
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
// ─── Types ────────────────────────────────────────────────────────────────

export interface IAgentTask {
	id: string;
	description: string;
	status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
	progress: number; // 0-100
	currentStep?: string;
	totalSteps?: number;
	currentStepIndex?: number;
	cost?: number;
	tokens?: number;
	createdAt: number;
	updatedAt: number;
	changedFiles?: string[];
}

export interface IAgentManagerService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTasks: Event<void>;
	readonly onDidChangeActiveTask: Event<IAgentTask | undefined>;

	getTasks(): IAgentTask[];
	getActiveTask(): IAgentTask | undefined;
	submitTask(description: string): Promise<IAgentTask>;
	stopTask(taskId: string): Promise<void>;
	resumeTask(taskId: string): Promise<void>;
	rollbackTask(taskId: string): Promise<void>;

	togglePanel(): void;
	focusPanel(): void;
}

export const IAgentManagerService = createDecorator<IAgentManagerService>('agentManagerService');

// ─── Implementation ──────────────────────────────────────────────────────

export class AgentManagerService extends Disposable implements IAgentManagerService {
	declare readonly _serviceBrand: undefined;

	private readonly _tasks: Map<string, IAgentTask> = new Map();
	private _activeTaskId: string | undefined;

	private readonly _onDidChangeTasks = this._register(new Emitter<void>());
	readonly onDidChangeTasks: Event<void> = this._onDidChangeTasks.event;

	private readonly _onDidChangeActiveTask = this._register(new Emitter<IAgentTask | undefined>());
	readonly onDidChangeActiveTask: Event<IAgentTask | undefined> = this._onDidChangeActiveTask.event;

	constructor() {
		super();
	}

	getTasks(): IAgentTask[] {
		return Array.from(this._tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getActiveTask(): IAgentTask | undefined {
		if (!this._activeTaskId) return undefined;
		return this._tasks.get(this._activeTaskId);
	}

	async submitTask(description: string): Promise<IAgentTask> {
		const task: IAgentTask = {
			id: `task-${Date.now()}`,
			description,
			status: 'pending',
			progress: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		this._tasks.set(task.id, task);
		this._activeTaskId = task.id;
		this._onDidChangeTasks.fire();
		this._onDidChangeActiveTask.fire(task);

		// TODO: Connect to AIKOS API to submit task
		// const response = await fetch(`${apiUrl}/tasks`, { method: 'POST', body: JSON.stringify({ description }) });

		return task;
	}

	async stopTask(taskId: string): Promise<void> {
		const task = this._tasks.get(taskId);
		if (task && (task.status === 'running' || task.status === 'pending')) {
			task.status = 'paused';
			task.updatedAt = Date.now();
			this._onDidChangeTasks.fire();
			// TODO: POST /tasks/{taskId}/stop
		}
	}

	async resumeTask(taskId: string): Promise<void> {
		const task = this._tasks.get(taskId);
		if (task && task.status === 'paused') {
			task.status = 'running';
			task.updatedAt = Date.now();
			this._onDidChangeTasks.fire();
			// TODO: POST /tasks/{taskId}/resume
		}
	}

	async rollbackTask(taskId: string): Promise<void> {
		const task = this._tasks.get(taskId);
		if (task) {
			// TODO: POST /tasks/{taskId}/rollback
			this._tasks.delete(taskId);
			if (this._activeTaskId === taskId) {
				this._activeTaskId = undefined;
				this._onDidChangeActiveTask.fire(undefined);
			}
			this._onDidChangeTasks.fire();
		}
	}

	togglePanel(): void {
		// TODO: Toggle panel visibility via IViewsService
	}

	focusPanel(): void {
		// TODO: Focus the agent manager panel
	}
}
