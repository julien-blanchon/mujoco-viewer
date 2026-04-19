<!--
@component
VisualOptionsPanel

Shadcn-style pane mirroring MuJoCo's mjvOption / mjvScene.flags. Drives the
`VisualOptions` instance shared with in-canvas debug components.
-->
<script lang="ts">
	import type { VisualOptions, FrameMode } from 'mujoco-svelte';
	import * as Pane from '$lib/components/ui/pane/index.js';
	import ShapesIcon from '@lucide/svelte/icons/shapes';
	import PaintbrushIcon from '@lucide/svelte/icons/paintbrush';
	import Axis3dIcon from '@lucide/svelte/icons/axis-3d';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import RulerIcon from '@lucide/svelte/icons/ruler';
	import MountainIcon from '@lucide/svelte/icons/mountain';

	type Props = {
		options: VisualOptions;
	};

	let { options }: Props = $props();

	const FRAME_MODES: Record<string, FrameMode> = {
		None: 'none',
		World: 'world',
		Bodies: 'body',
		Geoms: 'geom',
		Sites: 'site',
		COM: 'com',
		Contacts: 'contact'
	};

	// Only the `geom` and `site` groups are actually consumed by the renderer /
	// overlays today; hide the rest until they're wired up.
	const GROUP_KINDS = ['geom', 'site'] as const;
</script>

<Pane.Root title="Visual options" variant="flat">
	<Pane.Folder title="Environment" icon={MountainIcon} open={true}>
		<Pane.Checkbox
			bind:value={options.render.defaultFloor}
			label="Default floor"
		/>
		<Pane.Checkbox
			bind:value={options.render.defaultSkybox}
			label="Default skybox"
		/>
	</Pane.Folder>

	<Pane.Folder title="Elements" icon={ShapesIcon} open={true}>
		<Pane.Checkbox bind:value={options.vis.joint} label="Joints" />
		<Pane.Checkbox bind:value={options.vis.com} label="Center of mass" />
		<Pane.Checkbox bind:value={options.vis.tendon} label="Tendons" />
		<Pane.Checkbox bind:value={options.vis.light} label="Lights" />
		<Pane.Checkbox bind:value={options.vis.camera} label="Cameras" />
		<Pane.Checkbox bind:value={options.vis.inertia} label="Inertia" />
		<Pane.Checkbox bind:value={options.vis.contactPoint} label="Contact points" />
		<Pane.Checkbox bind:value={options.vis.contactForce} label="Contact forces" />
		<Pane.Checkbox bind:value={options.vis.perturbForce} label="Perturb force" />
	</Pane.Folder>

	<Pane.Folder title="Render" icon={PaintbrushIcon} open={true}>
		<Pane.Checkbox bind:value={options.render.shadow} label="Shadows" />
		<Pane.Checkbox bind:value={options.render.skybox} label="Skybox" />
		<Pane.Checkbox bind:value={options.render.wireframe} label="Wireframe" />
		<Pane.Checkbox bind:value={options.render.fog} label="Fog" />
		<Pane.Checkbox bind:value={options.render.haze} label="Haze" />
		<Pane.Checkbox bind:value={options.vis.transparent} label="Transparent" />
		<!--
			`render.reflection` is only read at scene-build time — toggling it
			live would require a full rebuild. Reload the scene after changing.
		-->
		<Pane.Checkbox bind:value={options.render.reflection} label="Reflections (on load)" />
	</Pane.Folder>

	<Pane.Folder title="Frame axes" icon={Axis3dIcon} open={false}>
		<Pane.Select bind:value={options.frame} options={FRAME_MODES} label="Show for" />
		<Pane.Slider bind:value={options.scale.frame} label="Length" min={0.01} max={0.5} step={0.01} />
	</Pane.Folder>

	<Pane.Folder title="Groups" icon={LayersIcon} open={false}>
		{#each GROUP_KINDS as kind (kind)}
			<Pane.Row label={kind}>
				<div class="grid grid-cols-6 items-center gap-1">
					{#each [0, 1, 2, 3, 4, 5] as slot (slot)}
						<label
							class="text-muted-foreground flex cursor-pointer items-center justify-center gap-1 text-[10px]"
						>
							<input
								type="checkbox"
								class="accent-primary size-3"
								bind:checked={options.groups[kind][slot]}
								aria-label="{kind} group {slot}"
							/>
							{slot}
						</label>
					{/each}
				</div>
			</Pane.Row>
		{/each}
	</Pane.Folder>

	<Pane.Folder title="Scales" icon={RulerIcon} open={false}>
		<Pane.Slider
			bind:value={options.scale.contactForce}
			label="Contact force"
			min={0}
			max={1}
			step={0.01}
		/>
		<Pane.Slider
			bind:value={options.scale.perturbForce}
			label="Perturb"
			min={0}
			max={1}
			step={0.01}
		/>
		<Pane.Slider
			bind:value={options.scale.com}
			label="COM marker"
			min={0.005}
			max={0.1}
			step={0.005}
		/>
		<Pane.Slider
			bind:value={options.transparentAlpha}
			label="Transparent α"
			min={0.05}
			max={1}
			step={0.05}
		/>
	</Pane.Folder>
</Pane.Root>
