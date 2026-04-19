<!--
@component
TextureInspector — preview canvas + intrinsic dimensions (width/height/
channels are derived from the image file, not meaningful to edit). Other
attributes (type, builtin, mark/markrgb, etc.) come from `AttrEditList`.
-->
<script lang="ts">
	import { decode2D, decodeCube, type MujocoSimState, type TextureInfo } from 'mujoco-svelte';

	type Props = {
		sim: MujocoSimState;
		info: TextureInfo;
	};

	let { sim, info }: Props = $props();

	let canvasEl = $state<HTMLCanvasElement>();

	$effect(() => {
		const model = sim.mjModel;
		if (!model || !canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		if (info.type === 0) {
			const tex = decode2D(model, info.id);
			if (!tex) return;
			const img = tex.image as {
				data: Uint8Array | Uint8ClampedArray;
				width: number;
				height: number;
			};
			const targetW = Math.min(256, img.width);
			const targetH = Math.round(targetW * (img.height / img.width));
			canvasEl.width = targetW;
			canvasEl.height = targetH;
			const raw = new Uint8ClampedArray(img.data);
			const full = new ImageData(raw, img.width, img.height);
			const scratch = document.createElement('canvas');
			scratch.width = img.width;
			scratch.height = img.height;
			scratch.getContext('2d')!.putImageData(full, 0, 0);
			ctx.drawImage(scratch, 0, 0, targetW, targetH);
			tex.dispose();
		} else {
			const cube = decodeCube(model, info.id);
			if (!cube) return;
			const imgs = cube.images as unknown as HTMLCanvasElement[];
			const faceSize = imgs[0]?.width ?? 0;
			if (!faceSize) return;
			const targetW = 128;
			const targetH = targetW * 6;
			canvasEl.width = targetW;
			canvasEl.height = targetH;
			for (let f = 0; f < 6; f++) ctx.drawImage(imgs[f], 0, f * targetW, targetW, targetW);
			cube.dispose();
		}
	});
</script>

<div class="flex flex-col gap-2">
	<div class="font-mono text-[11px] text-muted-foreground">
		{info.width}×{info.height} · {info.nchannel} channels
	</div>
	<canvas
		bind:this={canvasEl}
		class="max-w-full border border-border bg-background [image-rendering:pixelated]"
	></canvas>
</div>
