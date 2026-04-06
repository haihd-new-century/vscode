/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Agent Manager Contribution
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, IViewDescriptor, ViewContainerLocation, Extensions as ViewExtensions, ViewContainer } from '../../../common/views.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IAgentManagerService } from './agentManagerService.js';
import { AgentManagerService } from './agentManagerService.js';
import { AgentManagerViewPane } from './agentManagerView.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';

// ─── Icons ────────────────────────────────────────────────────────────────

const agentManagerIcon = registerIcon('agent-manager-view-icon', Codicon.hubot, localize('agentManagerViewIcon', 'View icon of the Agent Manager view.'));

// ─── View Container ───────────────────────────────────────────────────────

const VIEW_CONTAINER_ID = 'workbench.view.agentManager';
const AGENT_MANAGER_VIEW_ID = 'workbench.panel.agentManager';

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);

const agentManagerViewContainer: ViewContainer = viewContainerRegistry.registerViewContainer({
	id: VIEW_CONTAINER_ID,
	title: localize2('agentManager', 'Agent Manager'),
	icon: agentManagerIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'workbench.view.agentManager',
	hideIfEmpty: false,
}, ViewContainerLocation.Panel, { isDefault: false });

// ─── Views ────────────────────────────────────────────────────────────────

class AgentManagerViewDescriptor implements IViewDescriptor {
	readonly id = AGENT_MANAGER_VIEW_ID;
	readonly name: ILocalizedString = localize2('agentManagerView', 'Agent Tasks');
	readonly containerIcon = agentManagerIcon;
	readonly ctorDescriptor = new SyncDescriptor(AgentManagerViewPane);
	readonly order = 1;
	readonly canToggleVisibility = true;
	readonly canMoveView = true;
	readonly collapsed = false;

	focusCommand = { id: 'workbench.action.focusAgentManager' };
}

const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([new AgentManagerViewDescriptor()], agentManagerViewContainer);

// ─── Service ──────────────────────────────────────────────────────────────

registerSingleton(IAgentManagerService, AgentManagerService, InstantiationType.Delayed);

// ─── Actions ──────────────────────────────────────────────────────────────

registerAction2(class ToggleAgentManagerAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.toggleAgentManager',
			title: localize2('toggleAgentManager', 'Toggle Agent Manager'),
			f1: true,
			keybinding: {
				primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 50 /* KeyCode.KeyM */,
				weight: 200 /* KeybindingWeight.WorkbenchContrib */,
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IAgentManagerService);
		// Toggle the agent manager panel
		viewsService.togglePanel();
	}
});

registerAction2(class FocusAgentManagerAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.focusAgentManager',
			title: localize2('focusAgentManager', 'Focus Agent Manager'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IAgentManagerService);
		viewsService.focusPanel();
	}
});

// ─── Workbench Contribution ───────────────────────────────────────────────

class AgentManagerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentManager';

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentManagerService private readonly _agentManagerService: IAgentManagerService,
	) {
		super();
		// Agent Manager contribution initialized
		// Future: auto-connect to AIKOS WebSocket, poll tasks, etc.
	}
}

registerWorkbenchContribution2(AgentManagerContribution.ID, AgentManagerContribution, WorkbenchPhase.AfterRestored);
