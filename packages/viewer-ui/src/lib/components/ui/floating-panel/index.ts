import Root from './floating-panel.svelte';
import Header from './floating-panel-header.svelte';
import Body from './floating-panel-body.svelte';

export {
	Root,
	Header,
	Body,
	//
	Root as FloatingPanel,
	Header as FloatingPanelHeader,
	Body as FloatingPanelBody
};

export {
	FloatingPanelStack,
	provideFloatingPanelStack,
	getFloatingPanelStack,
	type FloatingPanelApi
} from './context.svelte.js';
