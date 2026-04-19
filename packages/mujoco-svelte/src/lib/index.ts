/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Public entrypoint for `mujoco-svelte`.
 */

// ---- Core providers ----
export { default as MujocoProvider } from './core/providers/MujocoProvider.svelte';
export { default as MujocoCanvas } from './core/providers/MujocoCanvas.svelte';
export { default as MujocoPhysics } from './core/providers/MujocoPhysics.svelte';

// ---- Reactive state types (for external consumers) ----
export type { MujocoSimState, SimEvents } from './core/state/MujocoSimState.svelte.js';

// ---- Context accessors ----
export { useMujocoWasm, useMujocoContext, MUJOCO_WASM_KEY, MUJOCO_SIM_KEY } from './core/context.js';
export { useMujoco } from './core/useMujoco.svelte.js';
export type { UseMujocoResult } from './core/useMujoco.svelte.js';
export { useBeforePhysicsStep, useAfterPhysicsStep } from './core/physicsStep.svelte.js';

// ---- Visual options (debug overlay toggles, render flags, group visibility) ----
export {
	VisualOptions,
	VISUAL_OPTIONS_KEY,
	provideVisualOptions,
	useVisualOptions
} from './core/state/VisualOptions.svelte.js';
export type { FrameMode, LabelMode, GroupVisibility } from './core/state/VisualOptions.svelte.js';

// ---- Scene loader & model introspection ----
export {
	loadScene,
	getName,
	findSiteByName,
	findActuatorByName,
	findKeyframeByName,
	findBodyByName,
	findJointByName,
	findGeomByName,
	findSensorByName,
	findTendonByName
} from './core/SceneLoader.js';

// ---- XML index + edit primitives (editor foundation) ----
export { XmlIndex } from './core/xml/XmlIndex.js';
export type {
	XmlIndexOptions,
	XmlFileEntry,
	IncludeResolver
} from './core/xml/XmlIndex.js';
export type {
	XmlAttrRecord,
	XmlEntityRecord,
	XmlSourceRange,
	XmlEntityEditability
} from './core/xml/types.js';
export {
	setAttr as xmlSetAttr,
	removeAttr as xmlRemoveAttr,
	renameElement as xmlRenameElement,
	removeElement as xmlRemoveElement,
	listAttrs as xmlListAttrs
} from './core/xml/XmlEditOps.js';

// ---- Frame scheduling keys ----
export { PHYSICS_STEP_KEY } from './core/frameKeys.js';

// ---- Rendering helpers ----
export {
	decode2D,
	decodeCube,
	decodeSkybox,
	decodeTexture
} from './rendering/TextureDecoder.js';
export { MaterialFactory } from './rendering/MaterialFactory.js';
export type { MaterialFactoryOptions } from './rendering/MaterialFactory.js';
export { GeomBuilder } from './rendering/GeomBuilder.js';

// ---- Backend ----
export { LocalEngine } from './core/engine/LocalEngine.js';
export type { SimEngine, EngineStatus, StepOptions, EngineEvents } from './core/engine/types.js';

// ---- Components ----
// Scene (the 3D content that gets rendered)
export { default as SceneRenderer } from './components/scene/SceneRenderer.svelte';
export { default as Headlight } from './components/scene/Headlight.svelte';
export { default as TendonRenderer } from './components/scene/TendonRenderer.svelte';
export { default as FlexRenderer } from './components/scene/FlexRenderer.svelte';

// Debug overlays
export { default as DebugGeoms } from './components/debug/DebugGeoms.svelte';
export { default as DebugSites } from './components/debug/DebugSites.svelte';
export { default as DebugJoints } from './components/debug/DebugJoints.svelte';
export { default as DebugCOM } from './components/debug/DebugCOM.svelte';
export { default as FrameAxes } from './components/debug/FrameAxes.svelte';
export { default as InertiaBoxes } from './components/debug/InertiaBoxes.svelte';
export { default as ContactMarkers } from './components/debug/ContactMarkers.svelte';
export { default as ContactForces } from './components/debug/ContactForces.svelte';

// Gizmos (typed entity glyphs)
export { default as CameraGizmos } from './components/gizmos/CameraGizmos.svelte';
export { default as LightGizmos } from './components/gizmos/LightGizmos.svelte';

// Selection feedback
export { default as SelectionMarker } from './components/selection/SelectionMarker.svelte';
export { default as SelectionRepresentation } from './components/selection/SelectionRepresentation.svelte';
export { default as GeomHoverOverlay } from './components/selection/GeomHoverOverlay.svelte';

// Interaction
export { default as WorldInteractivity } from './components/interaction/WorldInteractivity.svelte';
export { default as DragInteraction } from './components/interaction/DragInteraction.svelte';
export { default as PerturbArrows } from './components/interaction/PerturbArrows.svelte';
export { default as CameraController, type CameraMode } from './components/interaction/CameraController.svelte';

// Post-processing effects
export { default as RenderEffects } from './components/effects/RenderEffects.svelte';

// ---- Hooks ----
export { useActuators } from './hooks/physics/useActuators.svelte.js';
export { useCtrl } from './hooks/physics/useCtrl.svelte.js';
export { useCtrlNoise } from './hooks/physics/useCtrlNoise.svelte.js';
export { useBodyState } from './hooks/state/useBodyState.svelte.js';
export { useJointState } from './hooks/state/useJointState.svelte.js';
export { useSitePosition } from './hooks/state/useSitePosition.svelte.js';
export { useContacts, useContactEvents } from './hooks/state/useContacts.svelte.js';
export { useSensor, useSensors } from './hooks/state/useSensor.svelte.js';
export { useGamepad } from './hooks/input/useGamepad.svelte.js';
export { useKeyboardTeleop } from './hooks/input/useKeyboardTeleop.svelte.js';
export { usePolicy } from './hooks/input/usePolicy.svelte.js';
export { useSceneLights } from './hooks/scene/useSceneLights.svelte.js';
export { useBodyMeshes } from './hooks/scene/useBodyMeshes.svelte.js';
export { useCameraAnimation } from './hooks/scene/useCameraAnimation.svelte.js';
export { useVisualGlobals } from './hooks/scene/useVisualGlobals.svelte.js';
export type { VisualGlobals } from './hooks/scene/useVisualGlobals.svelte.js';
export { useRaycast } from './hooks/interaction/useRaycast.svelte.js';

// ---- Utilities (for building custom overlays / traversing the model) ----
export { makeOverlayObject, PulseAnimator, phaseFromId } from './utils/overlay.js';
export type { OverlayOptions, PulseConfig, PulseFactors } from './utils/overlay.js';
export {
	iterBodies,
	iterJoints,
	iterGeoms,
	iterSites,
	iterLights,
	iterCameras,
	iterTendons,
	iterActuators,
	iterSensors,
	iterBodySubtree,
	iterBodyGeoms,
	isBodyDescendant
} from './utils/modelIter.js';
export {
	readBodyPos,
	readBodyQuat,
	readBodyCom,
	readJointAnchor,
	readJointAxis,
	readGeomPos,
	readGeomMatrix,
	readSitePos,
	readSiteMatrix,
	readCameraMatrix,
	readCameraPos,
	readLightPos,
	readLightDir,
	maxBodyGeomSize,
	iterTendonWrapPoints
} from './utils/modelAccess.js';

// ---- Types ----
export type {
	// Scene config
	SceneConfig,
	SceneFileLoader,
	XmlPatch,
	SceneMarker,
	// Callbacks
	PhysicsStepCallback,
	// State management
	StateSnapshot,
	// Model introspection
	BodyInfo,
	JointInfo,
	GeomInfo,
	SiteInfo,
	ActuatorInfo,
	SensorInfo,
	CameraInfo,
	LightInfo,
	MaterialInfo,
	TextureInfo,
	MeshInfo,
	TendonInfo,
	EqualityInfo,
	KeyframeInfo,
	// Selection
	EntityKind,
	Selection,
	SelectedInfo,
	// Contacts
	ContactInfo,
	// Raycast
	RayHit,
	// Trajectory
	TrajectoryFrame,
	TrajectoryData,
	TrajectoryInput,
	PlaybackState,
	// Keyboard teleop
	KeyBinding,
	KeyboardTeleopOptions,
	// Policy
	PolicyOptions,
	// Component props
	DragInteractionProps,
	// API
	MujocoSimAPI,
	MujocoCanvasProps,
	// Hook return types
	SitePositionHandle,
	CtrlHandle,
	SensorHandle,
	BodyStateHandle,
	JointStateHandle,
	// Register (type-safe named resources)
	Register,
	Actuators,
	Sensors,
	Bodies,
	Joints,
	Sites,
	Geoms,
	Keyframes
} from './types.js';

// ---- Helpers ----
export { getContact } from './types.js';

// ---- MuJoCo types re-exports ----
export type {
	MujocoModule,
	MujocoModel,
	MujocoData,
	MujocoContact,
	MujocoContactArray
} from './types.js';
