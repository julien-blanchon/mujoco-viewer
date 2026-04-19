<!--
@component
SimControlsPanel — read-only runtime indicators for the active sim.
Play/Pause + Reset live in the top toolbar; this panel surfaces the time
graph and paused/running state so users can see what the sim is doing
without keeping the toolbar buttons in their peripheral vision.
-->
<script lang="ts">
	import type { MujocoSimState } from 'mujoco-svelte';
	import * as Pane from '$lib/components/ui/pane/index.js';
	import PlayIcon from '@lucide/svelte/icons/play';

	type Props = {
		sim: MujocoSimState | null;
	};

	let { sim }: Props = $props();
</script>

<Pane.Root title="Playback" variant="flat">
	<Pane.Folder title="Simulation" icon={PlayIcon} open={true}>
		{#if sim}
			<Pane.Monitor value={sim.time} label="Time (s)" graph bufferSize={120} />
			<Pane.Monitor value={sim.paused ? 'paused' : 'running'} label="State" />
		{/if}
	</Pane.Folder>
</Pane.Root>
