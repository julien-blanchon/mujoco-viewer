<!--
@component
EditToolbar — top-center floating toolbar with playback + Read/Edit + SaveMenu.
-->
<script lang="ts">
	import type { SceneState } from '$lib/stores/sceneState.svelte.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { viewMode } from '$lib/stores/viewMode.svelte.js';
	import { commands } from '$lib/commands/registry.svelte.js';
	import ModeToggle from './ModeToggle.svelte';
	import SaveMenu from './SaveMenu.svelte';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import RotateIcon from '@lucide/svelte/icons/rotate-ccw';

	type Props = {
		scene: SceneState;
	};

	let { scene }: Props = $props();

	const togglePaused = () => {
		scene.paused = !scene.paused;
	};
	const reset = () => {
		void commands.run('sim.reset');
	};
</script>

<div
	class="pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-card/90
		px-2 py-1 shadow-md backdrop-blur"
>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={scene.paused ? 'default' : 'secondary'}
					size="sm"
					class="h-7 w-7 p-0"
					onclick={togglePaused}
					aria-label={scene.paused ? 'Play simulation' : 'Pause simulation'}
				>
					{#if scene.paused}
						<PlayIcon class="size-4" />
					{:else}
						<PauseIcon class="size-4" />
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			{scene.paused ? 'Play (Space)' : 'Pause (Space)'}
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="sm"
					class="h-7 w-7 p-0"
					onclick={reset}
					aria-label="Reset simulation"
				>
					<RotateIcon class="size-4" />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Reset simulation (R)</Tooltip.Content>
	</Tooltip.Root>

	<div class="h-5 w-px bg-border"></div>

	<ModeToggle />

	{#if viewMode.isEditing}
		<div class="h-5 w-px bg-border"></div>
		<SaveMenu />
	{/if}
</div>
