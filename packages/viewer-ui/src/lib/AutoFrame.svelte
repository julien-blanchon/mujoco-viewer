<!--
@component
AutoFrame — computes scene bounds from MuJoCo geom positions + sizes and
fires `onFrame({ center, distance })` once the sim becomes ready (and each
time the scene is reloaded via `config` change).

Must sit inside `<MujocoPhysics>` so `useMujocoContext()` resolves.
-->
<script lang="ts">
	import { useMujocoContext } from 'mujoco-svelte';

	let {
		onFrame
	}: {
		onFrame: (info: {
			center: [number, number, number];
			distance: number;
			min: [number, number, number];
			max: [number, number, number];
		}) => void;
	} = $props();

	const sim = useMujocoContext();

	$effect(() => {
		if (sim.status !== 'ready') return;
		const model = sim.mjModel;
		const data = sim.mjData;
		if (!model || !data) return;

		const ngeom = model.ngeom;
		if (ngeom === 0) return;

		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity;
		let maxX = -Infinity,
			maxY = -Infinity,
			maxZ = -Infinity;

		// Expand each geom's world position by its size (conservative sphere
		// bounds). Skip plane geoms (type 0) because their nominal size is huge
		// and would blow the bbox to infinity.
		for (let i = 0; i < ngeom; i++) {
			if (model.geom_type[i] === 0) continue;
			const gx = data.geom_xpos[3 * i];
			const gy = data.geom_xpos[3 * i + 1];
			const gz = data.geom_xpos[3 * i + 2];
			const sx = model.geom_size[3 * i];
			const sy = model.geom_size[3 * i + 1];
			const sz = model.geom_size[3 * i + 2];
			const r = Math.max(sx, sy, sz) || 0.05;
			if (gx - r < minX) minX = gx - r;
			if (gy - r < minY) minY = gy - r;
			if (gz - r < minZ) minZ = gz - r;
			if (gx + r > maxX) maxX = gx + r;
			if (gy + r > maxY) maxY = gy + r;
			if (gz + r > maxZ) maxZ = gz + r;
		}

		if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		const cz = (minZ + maxZ) / 2;
		const dx = maxX - minX;
		const dy = maxY - minY;
		const dz = maxZ - minZ;
		const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
		const distance = Math.max(diag * 0.9, 0.5);

		onFrame({
			center: [cx, cy, cz],
			distance,
			min: [minX, minY, minZ],
			max: [maxX, maxY, maxZ]
		});
	});
</script>
