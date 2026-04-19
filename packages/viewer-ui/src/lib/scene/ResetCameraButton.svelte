<!--
@component
ResetCameraButton — dual-purpose affordance to the immediate left of the
main toolbar. Owns every "the camera is not at its default" affordance in
one place so the viewport doesn't sprout a second floating island.

Three visual states:
  1. Hidden — camera at default framing and in free-orbit mode. UI stays
     quiet.
  2. Icon-only rounded button — user has manually panned / orbited away.
     One tap re-runs AutoFrame.
  3. "Tracking: <body>" / "Fixed: <camera>" pill — non-free camera mode
     from the scene-tree "Track body" or "Use camera" actions. The pill
     shows what you're locked onto; its × leaves the mode (returning to
     free-orbit); clicking the body of the pill also reframes.
-->
<script lang="ts">
	import type { MujocoSimState } from 'mujoco-svelte';
	import type { CameraController } from '$lib/stores/cameraController.svelte.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import FocusIcon from '@lucide/svelte/icons/focus';
	import LocateFixedIcon from '@lucide/svelte/icons/locate-fixed';
	import VideoIcon from '@lucide/svelte/icons/video';
	import XIcon from '@lucide/svelte/icons/x';

	type Props = {
		camera: CameraController;
		sim: MujocoSimState | null;
	};

	let { camera, sim }: Props = $props();

	// Derived label for the active non-free camera mode. `bodies` / `cameras`
	// are reactive so the pill follows MJCF renames automatically.
	const modeInfo = $derived.by<{ kind: 'track' | 'fixed'; name: string } | null>(() => {
		const m = camera.mode;
		if (m === 'free') return null;
		if (typeof m === 'object' && m.kind === 'track') {
			const body = sim?.bodies.find((b) => b.id === m.bodyId);
			return { kind: 'track', name: body?.name || `#${m.bodyId}` };
		}
		if (typeof m === 'object' && m.kind === 'fixed') {
			const cam = sim?.cameras.find((c) => c.id === m.id);
			return { kind: 'fixed', name: cam?.name || `#${m.id}` };
		}
		return null;
	});

	const visible = $derived(modeInfo !== null || camera.viewDirty);
</script>

{#if visible}
	{#if modeInfo}
		<div
			class="inline-flex h-9 items-center gap-1.5 rounded-full border border-border
				bg-card/90 pr-1 pl-3 text-xs text-foreground shadow-md backdrop-blur"
		>
			{#if modeInfo.kind === 'fixed'}
				<VideoIcon class="size-3.5 text-muted-foreground" />
				<span class="text-muted-foreground">Fixed</span>
			{:else}
				<LocateFixedIcon class="size-3.5 text-muted-foreground" />
				<span class="text-muted-foreground">Tracking</span>
			{/if}
			<span class="max-w-[140px] truncate font-medium">{modeInfo.name}</span>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="ml-0.5 inline-flex size-7 items-center justify-center rounded-full
								text-muted-foreground transition-colors hover:bg-muted
								hover:text-foreground"
							onclick={() => camera.stopTracking()}
							aria-label={`Stop ${modeInfo.kind === 'fixed' ? 'fixed camera' : 'tracking'}`}
						>
							<XIcon class="size-3.5" />
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>
					Stop — return to free orbit (Esc)
				</Tooltip.Content>
			</Tooltip.Root>
		</div>
	{:else}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="sm"
						class="h-9 w-9 rounded-full border border-border bg-card/90 p-0 shadow-md backdrop-blur"
						onclick={() => camera.resetView()}
						aria-label="Reset camera view"
					>
						<FocusIcon class="size-4" />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Reset camera view (F)</Tooltip.Content>
		</Tooltip.Root>
	{/if}
{/if}
