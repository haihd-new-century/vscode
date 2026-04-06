/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Agent Panel Contribution (Cursor-style)
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, IViewDescriptor, ViewContainerLocation, Extensions as ViewExtensions, ViewContainer } from '../../../common/views.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IAgentManagerService } from './agentManagerService.js';
import { AgentManagerService } from './agentManagerService.js';
import { AgentPanelViewPane } from './agentManagerView.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';

// --- Icons ---

const agentPanelIcon = registerIcon('agent-panel-view-icon', Codicon.sparkle, localize('agentPanelViewIcon', 'View icon of the AIKOS Agent panel.'));

// --- View Container (Auxiliary Bar = right sidebar) ---

const VIEW_CONTAINER_ID = 'workbench.view.aikosAgent';
const AGENT_PANEL_VIEW_ID = 'workbench.view.aikosAgent.panel';

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);

const agentViewContainer: ViewContainer = viewContainerRegistry.registerViewContainer({
	id: VIEW_CONTAINER_ID,
	title: localize2('aikosAgent', 'Agent'),
	icon: agentPanelIcon,
	order: 0,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: VIEW_CONTAINER_ID,
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: false });

// --- View Descriptor ---

class AgentPanelViewDescriptor implements IViewDescriptor {
	readonly id = AGENT_PANEL_VIEW_ID;
	readonly name: ILocalizedString = localize2('aikosAgentPanel', 'Agent');
	readonly containerIcon = agentPanelIcon;
	readonly ctorDescriptor = new SyncDescriptor(AgentPanelViewPane);
	readonly order = 1;
	readonly canToggleVisibility = true;
	readonly canMoveView = true;
	readonly collapsed = false;
	readonly singleViewPaneContainerTitle = 'Agent';
}

const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([new AgentPanelViewDescriptor()], agentViewContainer);

// --- Service ---

registerSingleton(IAgentManagerService, AgentManagerService, InstantiationType.Delayed);

// --- Actions ---

registerAction2(class ToggleAgentPanelAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.toggleAikosAgent',
			title: localize2('toggleAikosAgent', 'Toggle AIKOS Agent'),
			f1: true,
			keybinding: {
				primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 50 /* KeyCode.KeyM */,
				weight: 200 /* KeybindingWeight.WorkbenchContrib */,
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const agentService = accessor.get(IAgentManagerService);
		agentService.togglePanel();
	}
});

registerAction2(class NewAgentAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.newAikosAgent',
			title: localize2('newAikosAgent', 'New Agent'),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const agentService = accessor.get(IAgentManagerService);
		agentService.newSession();
	}
});

// --- Workbench Contribution ---

class AgentPanelContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aikosAgent';

	constructor(
		@IInstantiationService _instantiationService: IInstantiationService,
		@IAgentManagerService _agentManagerService: IAgentManagerService,
	) {
		super();
	}
}

registerWorkbenchContribution2(AgentPanelContribution.ID, AgentPanelContribution, WorkbenchPhase.AfterRestored);
