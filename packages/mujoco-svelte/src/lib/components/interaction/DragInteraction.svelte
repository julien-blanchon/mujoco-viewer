<!--
@component
DragInteraction — Ctrl/Cmd+click-drag to apply spring forces to MuJoCo bodies.

Raycasts against scene meshes to identify bodies, then applies a spring force
pulling the grabbed point toward the cursor each physics frame. Requires Ctrl
(or Cmd on macOS) to avoid conflicting with OrbitControls.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask, useThrelte } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useBeforePhysicsStep } from '../../core/physicsStep.svelte.js';
	import type { DragInteractionProps } from '../../types.js';

	// Preallocated temps
	const _bodyPos = new THREE.Vector3();
	const _bodyQuat = new THREE.Quaternion();
	const _worldHit = new THREE.Vector3();
	const _raycaster = new THREE.Raycaster();
	const _mouse = new THREE.Vector2();

	let { stiffness = 250, showArrow = true }: DragInteractionProps = $props();

	const sim = useMujocoContext();
	const threlte = useThrelte();

	let dragging = false;
	let bodyId = -1;
	let grabDistance = 0;
	const localHit = new THREE.Vector3();
	const grabWorld = new THREE.Vector3();
	const mouseWorld = new THREE.Vector3();

	let group = $state<THREE.Group>();
	let arrow: THREE.ArrowHelper | null = null;

	$effect(() => {
		const g = group;
		if (!showArrow || !g) return;
		const a = new THREE.ArrowHelper(
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(),
			0.1,
			0xff4444
		);
		a.visible = false;
		(a.line.material as THREE.LineBasicMaterial).transparent = true;
		(a.line.material as THREE.LineBasicMaterial).opacity = 0.6;
		(a.cone.material as THREE.MeshBasicMaterial).transparent = true;
		(a.cone.material as THREE.MeshBasicMaterial).opacity = 0.6;
		g.add(a);
		arrow = a;
		return () => {
			g.remove(a);
			a.dispose();
			arrow = null;
		};
	});

	$effect(() => {
		const canvas = threlte.renderer.domElement;
		const camera = threlte.camera.current;
		const scene = threlte.scene;

		const getControls = () =>
			(threlte as unknown as { controls?: { current?: unknown } }).controls?.current as
				| { enabled?: boolean }
				| undefined;

		const onPointerDown = (evt: PointerEvent) => {
			if (evt.button !== 0) return;
			if (!evt.ctrlKey && !evt.metaKey) return;
			const rect = canvas.getBoundingClientRect();
			_mouse.set(
				((evt.clientX - rect.left) / rect.width) * 2 - 1,
				-((evt.clientY - rect.top) / rect.height) * 2 + 1
			);
			_raycaster.setFromCamera(_mouse, camera);
			const hits = _raycaster.intersectObjects(scene.children, true);
			for (const hit of hits) {
				let obj: THREE.Object3D | null = hit.object;
				while (obj && obj.userData.bodyID === undefined && obj.parent) obj = obj.parent;
				const bid = obj?.userData.bodyID as number | undefined;
				if (bid !== undefined && bid > 0) {
					bodyId = bid;
					dragging = true;
					grabDistance = hit.distance;
					const data = sim.mjData;
					if (data) {
						const i3 = bid * 3;
						const i4 = bid * 4;
						_bodyPos.set(data.xpos[i3], data.xpos[i3 + 1], data.xpos[i3 + 2]);
						_bodyQuat.set(
							data.xquat[i4 + 1],
							data.xquat[i4 + 2],
							data.xquat[i4 + 3],
							data.xquat[i4]
						);
						localHit.copy(hit.point).sub(_bodyPos);
						localHit.applyQuaternion(_bodyQuat.clone().invert());
					}
					mouseWorld.copy(hit.point);
					grabWorld.copy(hit.point);
					const controls = getControls();
					if (controls) controls.enabled = false;
					break;
				}
			}
		};

		const onPointerMove = (evt: PointerEvent) => {
			if (!dragging) return;
			if (evt.buttons === 0) {
				dragging = false;
				bodyId = -1;
				const controls = getControls();
				if (controls) controls.enabled = true;
				return;
			}
			const rect = canvas.getBoundingClientRect();
			_mouse.set(
				((evt.clientX - rect.left) / rect.width) * 2 - 1,
				-((evt.clientY - rect.top) / rect.height) * 2 + 1
			);
			_raycaster.setFromCamera(_mouse, camera);
			mouseWorld
				.copy(_raycaster.ray.origin)
				.addScaledVector(_raycaster.ray.direction, grabDistance);
		};

		const onPointerUp = () => {
			if (!dragging) return;
			dragging = false;
			bodyId = -1;
			const controls = getControls();
			if (controls) controls.enabled = true;
		};

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerUp);
		};
	});

	// Apply spring force each physics frame via the engine so this works the
	// same way in both the local and worker backends.
	useBeforePhysicsStep((model, data) => {
		if (!dragging || bodyId <= 0) return;
		const bid = bodyId;
		const i3 = bid * 3;
		const i4 = bid * 4;
		_bodyPos.set(data.xpos[i3], data.xpos[i3 + 1], data.xpos[i3 + 2]);
		_bodyQuat.set(data.xquat[i4 + 1], data.xquat[i4 + 2], data.xquat[i4 + 3], data.xquat[i4]);
		_worldHit.copy(localHit);
		_worldHit.applyQuaternion(_bodyQuat);
		_worldHit.add(_bodyPos);
		grabWorld.copy(_worldHit);

		const mass = model.body_mass[bid];
		const s = stiffness * mass;
		sim.engine.applyForce(
			bid,
			(mouseWorld.x - _worldHit.x) * s,
			(mouseWorld.y - _worldHit.y) * s,
			(mouseWorld.z - _worldHit.z) * s,
			_worldHit.x,
			_worldHit.y,
			_worldHit.z
		);
	});

	// Update arrow visual each frame
	useTask(
		(_delta) => {
			const a = arrow;
			if (!a) return;
			if (dragging && bodyId > 0) {
				a.visible = true;
				const dir = _bodyPos.copy(mouseWorld).sub(grabWorld);
				const len = dir.length();
				if (len > 0.001) {
					dir.normalize();
					a.position.copy(grabWorld);
					a.setDirection(dir);
					a.setLength(len, Math.min(len * 0.2, 0.05), Math.min(len * 0.1, 0.03));
				}
			} else {
				a.visible = false;
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={group} />
{/if}
