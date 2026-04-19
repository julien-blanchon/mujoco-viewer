/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Enum name tables used by model introspection. Keep these in sync with
 * MuJoCo's `mjtSensor` / `mjtJoint` / `mjtGeom` enums (see mjcore.h).
 */

export const JOINT_TYPE_NAMES = ['free', 'ball', 'slide', 'hinge'] as const;

/** `mjtTexture` enum: 2D planar, 6-face cube, skybox cube. */
export const TEXTURE_TYPE_NAMES = ['2d', 'cube', 'skybox'] as const;

/** `mjtLightType`: spot, directional, point. */
export const LIGHT_TYPE_NAMES = ['spot', 'directional', 'point'] as const;

/** `mjtCamLight` camera tracking modes. */
export const CAMERA_MODE_NAMES = [
	'fixed',
	'track',
	'trackcom',
	'targetbody',
	'targetbodycom'
] as const;

/** `mjtEq` equality constraint kinds. */
export const EQUALITY_TYPE_NAMES = [
	'connect',
	'weld',
	'joint',
	'tendon',
	'flex',
	'distance'
] as const;

export const GEOM_TYPE_NAMES = [
	'plane',
	'hfield',
	'sphere',
	'capsule',
	'ellipsoid',
	'cylinder',
	'box',
	'mesh'
] as const;

export const SENSOR_TYPE_NAMES: Record<number, string> = {
	0: 'touch',
	1: 'accelerometer',
	2: 'velocimeter',
	3: 'gyro',
	4: 'force',
	5: 'torque',
	6: 'magnetometer',
	7: 'rangefinder',
	8: 'camprojection',
	9: 'jointpos',
	10: 'jointvel',
	11: 'tendonpos',
	12: 'tendonvel',
	13: 'actuatorpos',
	14: 'actuatorvel',
	15: 'actuatorfrc',
	16: 'jointactfrc',
	17: 'tendonactfrc',
	18: 'ballquat',
	19: 'ballangvel',
	20: 'jointlimitpos',
	21: 'jointlimitvel',
	22: 'jointlimitfrc',
	23: 'tendonlimitpos',
	24: 'tendonlimitvel',
	25: 'tendonlimitfrc',
	26: 'framepos',
	27: 'framequat',
	28: 'framexaxis',
	29: 'frameyaxis',
	30: 'framezaxis',
	31: 'framelinvel',
	32: 'frameangvel',
	33: 'framelinacc',
	34: 'frameangacc',
	35: 'subtreecom',
	36: 'subtreelinvel',
	37: 'subtreeangmom',
	38: 'insidesite',
	39: 'geomdist',
	40: 'geomnormal',
	41: 'geomfromto',
	42: 'contact',
	43: 'e_potential',
	44: 'e_kinetic',
	45: 'clock',
	46: 'tactile',
	47: 'plugin',
	48: 'user'
};
