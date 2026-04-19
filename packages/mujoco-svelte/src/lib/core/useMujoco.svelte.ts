/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Public read-only accessor for the MuJoCo sim. Returns a tagged union so
 * consumers can render loading / error states.
 */

import { useMujocoContext } from './context.js';
import type { MujocoData, MujocoModel, MujocoSimAPI } from '../types.js';

export type UseMujocoResult =
	| {
			status: 'loading';
			isPending: true;
			isReady: false;
			isError: false;
			error: null;
			api: null;
			mjModel: null;
			mjData: null;
	  }
	| {
			status: 'error';
			isPending: false;
			isReady: false;
			isError: true;
			error: string;
			api: null;
			mjModel: null;
			mjData: null;
	  }
	| {
			status: 'ready';
			isPending: false;
			isReady: true;
			isError: false;
			error: null;
			api: MujocoSimAPI;
			mjModel: MujocoModel;
			mjData: MujocoData;
	  };

/**
 * Access the MuJoCo sim state. The returned object is reactive — call it
 * inside a component / effect and the shape will change as `status` moves
 * from 'loading' → 'ready' / 'error'.
 */
export function useMujoco(): UseMujocoResult {
	const ctx = useMujocoContext();
	const status = ctx.status;

	if (status === 'ready' && ctx.mjModel && ctx.mjData) {
		return {
			status: 'ready',
			isPending: false,
			isReady: true,
			isError: false,
			error: null,
			api: ctx.api,
			mjModel: ctx.mjModel,
			mjData: ctx.mjData
		};
	}
	if (status === 'error') {
		return {
			status: 'error',
			isPending: false,
			isReady: false,
			isError: true,
			error: ctx.error ?? 'Unknown error',
			api: null,
			mjModel: null,
			mjData: null
		};
	}
	return {
		status: 'loading',
		isPending: true,
		isReady: false,
		isError: false,
		error: null,
		api: null,
		mjModel: null,
		mjData: null
	};
}
