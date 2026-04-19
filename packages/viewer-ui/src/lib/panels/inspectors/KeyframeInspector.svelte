<!--
@component
KeyframeInspector — Apply button to restore the keyframe's qpos/qvel/ctrl.
qpos/qvel/ctrl vectors come from the generic `AttrEditList`.
-->
<script lang="ts">
	import type { MujocoSimState } from 'mujoco-svelte';
	import * as Pane from '$lib/components/ui/pane/index.js';

	type Props = {
		sim: MujocoSimState;
		info: { id: number; name: string };
	};

	let { sim, info }: Props = $props();

	function apply(): void {
		void sim.api.applyKeyframe(info.id);
	}
</script>

<Pane.Root>
	<Pane.Button title="Apply keyframe" onclick={apply} />
</Pane.Root>
