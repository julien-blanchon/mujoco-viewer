<script lang="ts">
	/**
	 * ViewerApp — top-level MuJoCo viewer shell that both the VSCode extension
	 * and the debug web app mount. Every platform-specific concern (file I/O,
	 * theme, live edits, settings) flows in through the {@link HostAdapter} prop.
	 *
	 * Responsibilities:
	 *   1. Ask the adapter for the initial model, map it to a `SceneConfig` that
	 *      points at the host's `fileLoader` + `assetBaseUri`.
	 *   2. Mirror out-of-band file changes from the host (editor edits) into
	 *      the sim via `reloadFromFiles`.
	 *   3. Wire the adapter into `editSession` so Save goes back to the host.
	 *   4. Translate `adapter.settings.current` into VisualOptions / panel /
	 *      fly-controls state so host-side preferences round-trip.
	 *   5. React to host-dispatched commands (resetCamera, togglePlay, …) so
	 *      VSCode keybindings drive the viewer.
	 */
	import { VisualOptions, type SceneConfig, type SceneFileLoader } from 'mujoco-svelte';
	import { toast } from 'svelte-sonner';
	import type { HostAdapter, LoadModelPayload } from '@mujoco-viewer/protocol';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { provideFloatingPanelStack } from '$lib/components/ui/floating-panel/index.js';
	import { SceneState } from '$lib/stores/sceneState.svelte.js';
	import { CameraController } from '$lib/stores/cameraController.svelte.js';
	import { installCameraFlyControls } from '$lib/stores/cameraFlyControls.svelte.js';
	import { PanelLayout } from '$lib/stores/panelLayout.svelte.js';
	import { editSession } from '$lib/stores/editSession.svelte.js';
	import { registerSceneCommands } from '$lib/commands/sceneCommands.svelte.js';
	import { commands } from '$lib/commands/registry.svelte.js';
	import SceneStage from '$lib/scene/SceneStage.svelte';
	import PanelStack from '$lib/scene/PanelStack.svelte';
	import ResetCameraButton from '$lib/scene/ResetCameraButton.svelte';
	import EditToolbar from '$lib/edit/EditToolbar.svelte';

	interface Props {
		adapter: HostAdapter;
	}

	const { adapter }: Props = $props();

	provideFloatingPanelStack();

	const scene = new SceneState();
	const camera = new CameraController();
	const layout = new PanelLayout();
	const visualOptions = new VisualOptions();

	// Fly-controls pull tunables fresh each frame so setting changes take
	// effect without teardown / reinstall.
	const readFlyTunables = () => adapter.settings.current.camera;

	// In-memory file cache for the current model.
	let files = $state<Map<string, string>>(new Map());

	function buildConfig(payload: LoadModelPayload): SceneConfig {
		files = new Map(payload.files.map((f) => [f.path, f.content]));
		const fileLoader: SceneFileLoader = async (path) => {
			const xmlHit = files.get(path);
			if (xmlHit !== undefined) return xmlHit;
			if (adapter.readAsset) {
				const bytes = await adapter.readAsset(path);
				if (bytes) return bytes;
			}
			return null;
		};
		return {
			src: payload.assetBaseUri.endsWith('/')
				? payload.assetBaseUri
				: payload.assetBaseUri + '/',
			sceneFile: payload.rootPath,
			onMissingAsset: 'stub',
			fileLoader
		};
	}

	// 1. Wire the adapter into editSession so Save persists to the host.
	$effect(() => {
		editSession.setHostAdapter(adapter);
		return () => editSession.setHostAdapter(null);
	});

	// 2. Initial load.
	$effect(() => {
		let cancelled = false;
		adapter
			.loadInitial()
			.then((payload) => {
				if (cancelled) return;
				scene.config = buildConfig(payload);
				// Auto-play: respect the host setting on first load only. We pulse
				// `paused` exactly once so subsequent user toggles win.
				if (adapter.settings.current.simulation.autoPlay) {
					scene.paused = false;
				}
			})
			.catch((e: unknown) => {
				const msg = e instanceof Error ? e.message : String(e);
				scene.status = 'error';
				scene.sceneError = msg;
				adapter.reportError?.(msg);
			});
		return () => {
			cancelled = true;
		};
	});

	// 3. Live edits from the host (e.g., user typing in the VSCode editor).
	$effect(() => {
		const dispose = adapter.onFileChanged(async (path, content) => {
			files.set(path, content);
			// Optionally pause the sim so the user isn't chasing a moving target
			// while they edit. Idempotent — already-paused stays paused.
			if (adapter.settings.current.simulation.pauseOnFileChange) {
				scene.paused = true;
			}
			try {
				await scene.sim?.reloadFromFiles(new Map(files));
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				adapter.reportError?.(msg);
			}
		});
		return dispose;
	});

	// 4. Host-dispatched commands (VSCode keybindings, command palette).
	$effect(() => {
		if (!adapter.onCommand) return;
		return adapter.onCommand((cmd) => {
			switch (cmd) {
				case 'resetCamera':
					camera.resetView();
					break;
				case 'togglePlay':
					scene.paused = !scene.paused;
					break;
				case 'resetSimulation':
					void commands.run('sim.reset');
					break;
				case 'takeScreenshot':
					void captureScreenshot();
					break;
			}
		});
	});

	// 5. Map host settings → local VisualOptions. One-way sync, driven by the
	//    host — the user changing `mujoco-viewer.rendering.*` in VSCode is the
	//    only source of truth for these flags.
	$effect(() => {
		const r = adapter.settings.current.rendering;
		visualOptions.render.shadow = r.shadows;
		visualOptions.render.defaultFloor = r.showGrid;
		visualOptions.render.defaultSkybox = r.showSkybox;
		visualOptions.render.skybox = r.backgroundStyle === 'skybox';
	});

	// 6. Map panel-collapsed preference once on mount so users who want a
	//    minimal shell see it from the first paint.
	$effect(() => {
		if (adapter.settings.current.panels.defaultCollapsed) {
			layout.tree.collapsed = true;
			layout.controls.collapsed = true;
		}
	});

	// Re-attach the edit session when the active sim changes.
	$effect(() => {
		void scene.sim?.xmlIndex;
		editSession.attach(scene.sim);
	});

	// Register scene-wide keyboard commands.
	$effect(() => registerSceneCommands({ scene, camera }));

	// WASD / arrow-key fly navigation. Tunables are pulled from settings on
	// every tick so live changes propagate without reinstalling listeners.
	$effect(() => installCameraFlyControls(camera, readFlyTunables));

	// Flag the view as dirty whenever the user grabs OrbitControls, and
	// abort any in-flight camera tween so the drag wins immediately.
	$effect(() => {
		const ctrl = camera.orbit;
		if (!ctrl) return;
		const onStart = () => {
			camera.cancelTween();
			camera.viewDirty = true;
		};
		ctrl.addEventListener('start', onStart);
		return () => ctrl.removeEventListener('start', onStart);
	});

	// Surface MuJoCo compile failures as toasts.
	$effect(() =>
		editSession.onError((short) => {
			toast.error('Edit rejected by MuJoCo', {
				description: short,
				duration: 5000
			});
		})
	);

	// Open the inspector when a new entity is selected.
	$effect(() => {
		if (scene.sim?.selection) layout.openInspector();
	});

	// Follow selection → camera focus.
	$effect(() => {
		const sim = scene.sim;
		if (!sim) return;
		const sel = sim.selection;
		if (!sel) return;
		camera.followSelection(sim, sel);
	});

	/** Grab a PNG data URL from the current Three.js renderer and hand it to
	 *  the host. We re-render once synchronously so the captured frame reflects
	 *  the latest selection / overlays. */
	async function captureScreenshot(): Promise<void> {
		const canvas = document.querySelector<HTMLCanvasElement>('canvas');
		if (!canvas) {
			adapter.reportError?.('No canvas to screenshot');
			return;
		}
		try {
			const dataUrl = canvas.toDataURL('image/png');
			adapter.onScreenshot?.(dataUrl, canvas.width, canvas.height);
			if (!adapter.onScreenshot) {
				// Fallback for hosts that don't handle screenshots: offer a download.
				const a = document.createElement('a');
				a.href = dataUrl;
				a.download = `mujoco-screenshot-${Date.now()}.png`;
				a.click();
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			adapter.reportError?.(`Screenshot failed: ${msg}`);
		}
	}
</script>

<Tooltip.Provider delayDuration={300}>
	<div class="relative h-screen w-screen overflow-hidden bg-background">
		<main class="absolute inset-0">
			<SceneStage {scene} {camera} {visualOptions} />
		</main>

		<div class="pointer-events-none fixed top-2 left-1/2 z-30 -translate-x-1/2">
			<EditToolbar {scene} />
			<div class="pointer-events-auto absolute top-0 right-full mr-2">
				<ResetCameraButton {camera} sim={scene.sim} />
			</div>
		</div>
		<PanelStack {scene} {camera} {layout} {visualOptions} />
	</div>

	<Toaster position="bottom-right" richColors closeButton />
</Tooltip.Provider>
