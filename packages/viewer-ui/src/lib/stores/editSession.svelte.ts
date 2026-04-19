/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EditSession — staging buffer for XML edits.
 *
 * Three pieces of state, with a strict invariant:
 *
 *   baselineFiles    last saved (or initial-load) post-patch text for every
 *                    scene XML file — main + every `<include>`d file
 *   pending[]        ordered list of user edits since baseline
 *   draftFiles       baselineFiles + replay(pending)   (live in the sim)
 *
 * Discard reverts the sim to baseline. Save commits draft → baseline, clears
 * pending, and (for now) `console.log`s the per-file result.
 *
 * Edits stage immediately so the user sees live preview, but every edit goes
 * through the SaveMenu before being persisted to source. The session targets
 * the file that owns each record — edits to an entity defined in an include
 * splice the include's text, not the main scene.
 */

import {
	XmlIndex,
	xmlRemoveAttr,
	xmlRemoveElement,
	xmlRenameElement,
	xmlSetAttr,
	type EntityKind,
	type IncludeResolver,
	type MujocoSimState,
	type XmlEntityRecord
} from 'mujoco-svelte';
import type { HostAdapter } from '@mujoco-viewer/protocol';
import { attrRequires, mutexSiblingsOf } from '$lib/schema/uiMeta.js';

/**
 * Stable selector that survives reload/re-index. Uses the entity name when
 * available (the common case for bodies/joints/actuators), and falls back to
 * the baseline index otherwise. The baseline index is recorded at edit time
 * and may go stale if other edits add/remove entities; that's flagged at
 * replay time.
 */
export interface EntitySelector {
	kind: EntityKind;
	name: string | null;
	baselineIndex: number;
	/** Tag name kept for diff display ("body" vs "geom" vs "motor", ...). */
	tagName: string;
	/** File the entity was defined in at the time of staging. */
	sourceFile: string;
}

export type EditOp =
	| { kind: 'setAttr'; attr: string; before: string | null; after: string }
	| { kind: 'removeAttr'; attr: string; before: string }
	| { kind: 'rename'; before: string | null; after: string }
	| { kind: 'removeElement' };

export interface PendingEdit {
	id: string;
	target: EntitySelector;
	op: EditOp;
	timestamp: number;
	/** Per-replay status — set during `recompute()`. */
	status: 'ok' | 'invalid';
	error: string | null;
}

let nextEditId = 1;
function makeId(): string {
	return `e${nextEditId++}`;
}

function selectorFromRecord(rec: XmlEntityRecord): EntitySelector {
	return {
		kind: rec.kind,
		name: rec.name,
		baselineIndex: rec.index,
		tagName: rec.tagName,
		sourceFile: rec.sourceFile
	};
}

function resolveSelector(idx: XmlIndex, sel: EntitySelector): XmlEntityRecord | null {
	if (sel.name !== null) {
		const byName = idx.lookupByName(sel.kind, sel.name);
		if (byName) return byName;
	}
	return idx.lookup(sel.kind, sel.baselineIndex);
}

/**
 * Build an include resolver backed by an in-memory file map — the same shape
 * `MujocoSimState` uses, but we rebuild it during replay so each op sees the
 * latest draft of every file. Keeps include-aware indexing cheap.
 */
function resolverFor(files: Map<string, string>): IncludeResolver {
	return (relFile, fromFile) => {
		const fromDir = fromFile.includes('/')
			? fromFile.substring(0, fromFile.lastIndexOf('/') + 1)
			: '';
		const normalized = normalizeMjcfPath(fromDir + relFile);
		const candidates = normalized === relFile ? [normalized] : [normalized, relFile];
		for (const c of candidates) {
			const text = files.get(c);
			if (text !== undefined) return { fname: c, text };
		}
		return null;
	};
}

function normalizeMjcfPath(input: string): string {
	const parts = input.replace(/\/\//g, '/').split('/');
	const norm: string[] = [];
	for (const p of parts) {
		if (p === '..') norm.pop();
		else if (p !== '.') norm.push(p);
	}
	return norm.join('/');
}

function applyOp(
	files: Map<string, string>,
	rec: XmlEntityRecord,
	op: EditOp
): Map<string, string> {
	const text = files.get(rec.sourceFile);
	if (text === undefined) {
		throw new Error(`file not loaded: ${rec.sourceFile}`);
	}
	let next: string;
	switch (op.kind) {
		case 'setAttr':
			next = xmlSetAttr(text, rec, op.attr, op.after);
			break;
		case 'removeAttr':
			next = xmlRemoveAttr(text, rec, op.attr);
			break;
		case 'rename':
			next = xmlRenameElement(text, rec, op.after);
			break;
		case 'removeElement':
			next = xmlRemoveElement(text, rec);
			break;
	}
	const out = new Map(files);
	out.set(rec.sourceFile, next);
	return out;
}

interface ReplayResult {
	files: Map<string, string>;
	statuses: Array<{ status: 'ok' | 'invalid'; error: string | null }>;
}

/**
 * A single unit of staging work. `op` is an edit that contributes to replay;
 * `dropPending` silently removes a pre-existing pending setAttr for the given
 * target+attr without emitting a replay op (used by mutex staging to undo a
 * sibling edit that wasn't present in baseline).
 */
type BatchItem =
	| { intent: 'op'; sel: EntitySelector; op: EditOp }
	| { intent: 'dropPending'; sel: EntitySelector; attr: string };

/**
 * Turn a MuJoCo-flavoured error message into a short headline + full detail.
 *
 * `SceneLoader.formatLoadError` appends a paragraph starting with `\n(` that
 * explains the likely heap / missing-asset causes — helpful in a side panel,
 * but far too long for a toast. Strip it for the headline and collapse bare
 * `mjXError` / `mjCError` codes into something readable.
 */
export function shortenMujocoError(full: string): { short: string; detail: string } {
	// Strip leading "MuJoCo failed to load <file>: " so the toast doesn't waste
	// space repeating the scene path.
	const bodyMatch = full.match(/^MuJoCo failed to load [^:]+:\s*([\s\S]*)$/);
	const body = bodyMatch ? bodyMatch[1] : full;
	// The heuristic suffix starts on its own line with "(" — cut before it.
	const parenIdx = body.indexOf('\n(');
	const trimmed = (parenIdx >= 0 ? body.slice(0, parenIdx) : body).trim();
	const firstLine = trimmed.split('\n')[0] || trimmed;
	const short = /^mj[XC]Error$/.test(firstLine)
		? `${firstLine} — MuJoCo rejected the edited XML`
		: firstLine;
	return { short, detail: full };
}

/**
 * Coalesce same-target same-attr setAttr / rename edits — typing a new value
 * for `pos` shouldn't pile up three pending edits for the same field. Returns
 * the index of the pending entry to overwrite, or -1 if the op is fresh.
 */
function findCoalescable(
	pending: readonly PendingEdit[],
	target: EntitySelector,
	op: EditOp
): number {
	if (op.kind !== 'setAttr' && op.kind !== 'rename') return -1;
	const wantAttr = op.kind === 'setAttr' ? op.attr : 'name';
	for (let i = 0; i < pending.length; i++) {
		const e = pending[i];
		if (e.target.kind !== target.kind) continue;
		if (e.target.name !== target.name) continue;
		if (e.target.baselineIndex !== target.baselineIndex) continue;
		const eAttr = e.op.kind === 'setAttr' ? e.op.attr : e.op.kind === 'rename' ? 'name' : null;
		if (eAttr === wantAttr) return i;
	}
	return -1;
}

/**
 * Apply one op to a pending list, returning a new list.
 *
 * - setAttr / rename: coalesce with an existing entry for the same field if
 *   any, else append.
 * - removeAttr: drop any prior pending setAttr for the same (target, attr) —
 *   if the user added an attr and is now clearing it via a mutex swap, the
 *   original setAttr was never visible to MuJoCo in isolation, so keeping it
 *   in the diff view would mislead. Then append the removeAttr.
 * - removeElement: append as-is.
 */
function applyOpToPending(
	next: readonly PendingEdit[],
	target: EntitySelector,
	op: EditOp
): PendingEdit[] {
	let out: PendingEdit[] = next.slice();
	if (op.kind === 'removeAttr') {
		out = out.filter(
			(e) =>
				!(
					e.target.kind === target.kind &&
					e.target.name === target.name &&
					e.target.baselineIndex === target.baselineIndex &&
					e.op.kind === 'setAttr' &&
					e.op.attr === op.attr
				)
		);
	}
	const coalesceIdx = findCoalescable(out, target, op);
	const edit: PendingEdit = {
		id: makeId(),
		target,
		op,
		timestamp: Date.now(),
		status: 'ok',
		error: null
	};
	if (coalesceIdx >= 0) {
		out[coalesceIdx] = edit;
	} else {
		out.push(edit);
	}
	return out;
}

/**
 * Replay every edit against the baseline. Re-parse after each successful edit
 * so subsequent ones see fresh byte ranges. Selector resolution is "by name
 * first, baseline index as fallback" so renames mid-stream still work. Each
 * replay rebuilds a fresh include-aware XmlIndex over the current file map
 * so edits to include-defined entities splice the right file.
 */
function replay(
	baselineFiles: Map<string, string>,
	sourceFile: string,
	edits: PendingEdit[]
): ReplayResult {
	let cur = new Map(baselineFiles);
	const statuses: ReplayResult['statuses'] = [];
	for (const edit of edits) {
		try {
			const idx = new XmlIndex(cur.get(sourceFile) ?? '', {
				sourceFile,
				resolveInclude: resolverFor(cur)
			});
			const rec = resolveSelector(idx, edit.target);
			if (!rec) {
				statuses.push({
					status: 'invalid',
					error: `entity ${edit.target.kind}#${edit.target.baselineIndex} not found`
				});
				continue;
			}
			cur = applyOp(cur, rec, edit.op);
			statuses.push({ status: 'ok', error: null });
		} catch (e) {
			statuses.push({
				status: 'invalid',
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}
	return { files: cur, statuses };
}

export class EditSession {
	#sim = $state.raw<MujocoSimState | null>(null);
	#adapter: HostAdapter | null = null;
	#baselineFiles = $state<Map<string, string> | null>(null);
	/** Index of the baseline file map; rebuilt only on attach. Cached so we
	 *  can cheaply answer "does baseline have this attr?" without re-parsing
	 *  every mutex clear. */
	#baselineIndex: XmlIndex | null = null;
	#sourceFile = $state<string>('scene.xml');
	#pending = $state<PendingEdit[]>([]);
	/** The most recent draft that successfully reloaded into the sim. */
	#lastValidDraftFiles = $state<Map<string, string> | null>(null);
	#globalError = $state<string | null>(null);
	#applying = $state<boolean>(false);
	/** Commits are serialized through this chain — concurrent user input can
	 *  no longer overlap with an in-flight reload (which caused the "error
	 *  sticks across edits" symptom). */
	#commitChain: Promise<void> = Promise.resolve();

	get pending(): readonly PendingEdit[] {
		return this.#pending;
	}
	get hasChanges(): boolean {
		return this.#pending.length > 0;
	}
	/** Main-file baseline text — back-compat for consumers that only diff the
	 *  scene file. Returns null when no baseline is captured yet. */
	get baselineXml(): string | null {
		return this.#baselineFiles?.get(this.#sourceFile) ?? null;
	}
	/** Main-file draft text (replay applied). Mirrors `baselineXml`. */
	get draftXml(): string {
		return this.draftFiles?.get(this.#sourceFile) ?? '';
	}
	/** Full baseline file map — one entry per loaded XML file. `null` before
	 *  attach. Use `baselineXml` when you only need the scene file text. */
	get baselineFiles(): ReadonlyMap<string, string> | null {
		return this.#baselineFiles;
	}
	/** Full draft file map — baseline + replay(pending), per file. */
	get draftFiles(): ReadonlyMap<string, string> | null {
		const baseline = this.#baselineFiles;
		if (!baseline) return null;
		return replay(baseline, this.#sourceFile, this.#pending).files;
	}
	/**
	 * Files whose draft text differs from baseline, ordered main-first then
	 * by path. Useful for per-file diff views.
	 */
	get modifiedFiles(): Array<{ file: string; before: string; after: string }> {
		const baseline = this.#baselineFiles;
		const draft = this.draftFiles;
		if (!baseline || !draft) return [];
		const out: Array<{ file: string; before: string; after: string }> = [];
		const main = this.#sourceFile;
		const pushIfChanged = (file: string) => {
			const before = baseline.get(file) ?? '';
			const after = draft.get(file) ?? '';
			if (before !== after) out.push({ file, before, after });
		};
		if (baseline.has(main)) pushIfChanged(main);
		const others = [...baseline.keys()].filter((f) => f !== main).sort();
		for (const f of others) pushIfChanged(f);
		return out;
	}
	get lastValidDraftXml(): string | null {
		return this.#lastValidDraftFiles?.get(this.#sourceFile) ?? null;
	}
	/** Surfaced if the most recent reload attempt failed (compile error, ...). */
	get globalError(): string | null {
		return this.#globalError;
	}
	get isApplying(): boolean {
		return this.#applying;
	}
	get validEditCount(): number {
		return this.#pending.filter((e) => e.status === 'ok').length;
	}

	/**
	 * Wire the session to a host adapter so `save()` can persist edits back to
	 * whatever storage the host owns (VSCode workspace, File System Access API,
	 * etc.). When unset, `save()` falls back to the original `console.log` path
	 * so the library stays usable in standalone demos.
	 */
	setHostAdapter(adapter: HostAdapter | null): void {
		this.#adapter = adapter;
	}

	/** Route a structured log line through the adapter when available; fall
	 *  back to `console` only in headless / no-adapter usage (tests, demos).
	 *  Keeps release builds from spamming user DevTools in VSCode. */
	#log(level: 'error' | 'warn' | 'info' | 'debug', message: string): void {
		if (this.#adapter?.log) {
			this.#adapter.log(level, message);
			return;
		}
		const fn =
			level === 'error' ? console.error
				: level === 'warn' ? console.warn
					: console.log;
		fn(`[edit-session] ${message}`);
	}

	/** Ask the host to reveal a model-relative path in its editor, jumping to
	 *  `line:column` (1-based) when provided. No-op when the host adapter
	 *  doesn't support `openFile` (e.g. the standalone browser debug app). */
	openFile(path: string, line?: number, column?: number): void {
		this.#adapter?.openFile?.(path, line, column);
	}

	/**
	 * Bind the session to a sim. Idempotent on the same `sim` instance: a
	 * second call with the same sim only captures the initial file map the
	 * first time it becomes available (post-load) — it does NOT clear pending.
	 *
	 * Why: this is invoked from a `$effect` that tracks `sim.xmlIndex`, which
	 * fires *after* every reload — including the reloads we trigger ourselves.
	 * Resetting on every fire would wipe the user's pending list every time
	 * they made an edit. Only sim-instance swaps (scene change, backend
	 * change) trigger a full reset.
	 */
	attach(sim: MujocoSimState | null): void {
		const isNewSim = this.#sim !== sim;
		if (isNewSim) {
			this.#log('debug', `attach: ${sim ? 'new sim instance' : 'detached'}`);
			this.#sim = sim;
			this.#pending = [];
			this.#globalError = null;
			this.#baselineFiles = null;
			this.#baselineIndex = null;
			this.#lastValidDraftFiles = null;
		}
		// Capture the initial XML the first time it becomes available — handles
		// the loading→ready transition without touching pending state.
		if (this.#sim && this.#baselineFiles === null && this.#sim.currentXmlFiles) {
			this.#sourceFile = this.#sim.config.sceneFile;
			const snapshot = new Map(this.#sim.currentXmlFiles);
			this.#baselineFiles = snapshot;
			this.#lastValidDraftFiles = snapshot;
			const chars = [...snapshot.values()].reduce((n, s) => n + s.length, 0);
			this.#log(
				'debug',
				`baseline captured: ${this.#sourceFile} (${snapshot.size} file(s), ${chars} chars)`
			);
			const mainText = snapshot.get(this.#sourceFile) ?? '';
			this.#baselineIndex = new XmlIndex(mainText, {
				sourceFile: this.#sourceFile,
				resolveInclude: resolverFor(snapshot)
			});
		}
	}

	/**
	 * Does the baseline record for `sel` carry attribute `attr`? Answers
	 * "skip this removeAttr, it would be a no-op" for mutex-clear staging.
	 * Returns `false` if the selector can't be resolved in baseline (new
	 * entity / unstable index); callers should treat the attr as absent.
	 */
	#baselineHasAttr(sel: EntitySelector, attr: string): boolean {
		const idx = this.#baselineIndex;
		if (!idx) return false;
		const rec = resolveSelector(idx, sel);
		return rec?.attrs.has(attr) ?? false;
	}

	/** Is there a pending `setAttr` for (sel, attr)? Used so we drop a mutex
	 *  sibling's previous edit before appending its `removeAttr`, without
	 *  leaving the removeAttr itself around as a redundant no-op. */
	#pendingHasSetAttr(sel: EntitySelector, attr: string): boolean {
		for (const e of this.#pending) {
			if (e.target.kind !== sel.kind) continue;
			if (e.target.name !== sel.name) continue;
			if (e.target.baselineIndex !== sel.baselineIndex) continue;
			if (e.op.kind === 'setAttr' && e.op.attr === attr) return true;
		}
		return false;
	}

	async setAttr(rec: XmlEntityRecord, attr: string, value: string): Promise<void> {
		const before = rec.attrs.get(attr)?.value ?? null;
		if (before === value) return;

		// Co-requirement guard: `camera.principal` / `focal` / `focalpixel` need
		// `sensorsize` (and `resolution` for focalpixel) to already be set,
		// otherwise MuJoCo rejects the compile with a no-detail mjXError. Fail
		// fast with a clear toast instead of letting the user chase a cryptic
		// "MuJoCo reported an error without a message".
		const required = attrRequires(rec.tagName, attr);
		const missing = required.filter((req) => !rec.attrs.has(req));
		if (missing.length > 0) {
			const msg = `Setting ${rec.tagName}.${attr} requires ${missing.join(' and ')} to be set first`;
			this.#log('warn', msg);
			this.#globalError = msg;
			this.#emitError(msg);
			return;
		}

		const sel = selectorFromRecord(rec);
		const batch: BatchItem[] = [];

		// Mutex groups: MJCF rejects the compile when two mutually exclusive
		// attributes are set together (e.g. `axisangle` + `euler` →
		// "orientation overspecified"). For each sibling currently present on
		// the element, pick the minimal intent that cleans up:
		//   - baseline HAS the sibling → emit `removeAttr` to wipe it
		//   - sibling only exists via a pending `setAttr` (not in baseline)
		//     → emit `dropPending` so the pending entry is discarded with no
		//     replay-time op (avoids growing pending by one dead removeAttr
		//     per mutex swap, which ballooned to 11/11 in the user's log)
		const mutexClears: string[] = [];
		const mutexDropped: string[] = [];
		for (const sib of mutexSiblingsOf(attr)) {
			const sibBefore = rec.attrs.get(sib)?.value;
			if (sibBefore === undefined) continue;
			const inBaseline = this.#baselineHasAttr(sel, sib);
			const inPending = this.#pendingHasSetAttr(sel, sib);
			if (inBaseline) {
				batch.push({ intent: 'op', sel, op: { kind: 'removeAttr', attr: sib, before: sibBefore } });
				mutexClears.push(sib);
			} else if (inPending) {
				batch.push({ intent: 'dropPending', sel, attr: sib });
				mutexDropped.push(sib);
			}
			// else: attr is absent everywhere, nothing to do
		}

		batch.push({ intent: 'op', sel, op: { kind: 'setAttr', attr, before, after: value } });

		const clearBits: string[] = [];
		if (mutexClears.length > 0) clearBits.push(`clears ${mutexClears.join(', ')}`);
		if (mutexDropped.length > 0) clearBits.push(`drops pending ${mutexDropped.join(', ')}`);
		const suffix = clearBits.length > 0 ? ` (${clearBits.join('; ')})` : '';
		this.#log(
			'debug',
			`setAttr ${recLabel(rec)} ${attr}: ${formatVal(before)} → ${formatVal(value)}${suffix}`
		);

		await this.#stageBatch(batch);
	}

	async removeAttr(rec: XmlEntityRecord, attr: string): Promise<void> {
		const before = rec.attrs.get(attr)?.value;
		if (before === undefined) return;
		this.#log('debug', `removeAttr ${recLabel(rec)} ${attr}`);
		const sel = selectorFromRecord(rec);
		await this.#stageBatch([{ intent: 'op', sel, op: { kind: 'removeAttr', attr, before } }]);
	}

	async rename(rec: XmlEntityRecord, newName: string): Promise<void> {
		if (rec.name === newName) return;
		this.#log(
			'debug',
			`rename ${recLabel(rec)} ${formatVal(rec.name)} → ${formatVal(newName)}`
		);
		const sel = selectorFromRecord(rec);
		await this.#stageBatch([
			{ intent: 'op', sel, op: { kind: 'rename', before: rec.name, after: newName } }
		]);
	}

	async remove(rec: XmlEntityRecord): Promise<void> {
		this.#log('debug', `removeElement ${recLabel(rec)}`);
		const sel = selectorFromRecord(rec);
		await this.#stageBatch([{ intent: 'op', sel, op: { kind: 'removeElement' } }]);
	}

	async #stageBatch(batch: BatchItem[]): Promise<void> {
		const baseline = this.#baselineFiles;
		const sim = this.#sim;
		if (!baseline || !sim) {
			this.#log(
				'warn',
				`no baseline / sim attached; ignoring edit (hasBaseline=${!!baseline}, hasSim=${!!sim})`
			);
			return;
		}
		let next = this.#pending.slice();
		for (const item of batch) {
			if (item.intent === 'dropPending') {
				const { sel, attr } = item;
				next = next.filter(
					(e) =>
						!(
							e.target.kind === sel.kind &&
							e.target.name === sel.name &&
							e.target.baselineIndex === sel.baselineIndex &&
							e.op.kind === 'setAttr' &&
							e.op.attr === attr
						)
				);
			} else {
				next = applyOpToPending(next, item.sel, item.op);
			}
		}
		await this.#enqueueCommit(next);
	}

	async discardEdit(id: string): Promise<void> {
		const next = this.#pending.filter((e) => e.id !== id);
		if (next.length === this.#pending.length) return;
		await this.#enqueueCommit(next);
	}

	async discardAll(): Promise<void> {
		await this.#enqueueCommit([]);
	}

	/**
	 * Persist `draftFiles` as the new baseline and hand the modified files to
	 * the host adapter (VSCode extension / File System Access API / etc.). When
	 * no adapter is wired the old `console.log` path runs instead, so the
	 * library still works in standalone demos.
	 */
	async save(): Promise<void> {
		const baseline = this.#baselineFiles;
		const draft = this.draftFiles;
		if (!baseline || !draft || !this.hasChanges) return;
		const summary = this.#pending.map((e) => editLabel(e)).join('\n');
		const changed = this.modifiedFiles;

		if (this.#adapter) {
			try {
				await this.#adapter.save(
					changed.map((c) => ({ path: c.file, content: c.after }))
				);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.#globalError = `Save failed: ${msg}`;
				this.#adapter.reportError?.(msg);
				return;
			}
		} else {
			console.groupCollapsed(
				`%c[xml-save] applying ${this.#pending.length} edit(s) across ${changed.length} file(s)`,
				'color: #4ec9b0'
			);
			console.log(summary);
			for (const entry of changed) {
				console.log(`---- ${entry.file} ----`);
				console.log(entry.after);
			}
			console.groupEnd();
		}

		const newBaseline = new Map(draft);
		this.#baselineFiles = newBaseline;
		this.#lastValidDraftFiles = newBaseline;
		this.#baselineIndex = new XmlIndex(newBaseline.get(this.#sourceFile) ?? '', {
			sourceFile: this.#sourceFile,
			resolveInclude: resolverFor(newBaseline)
		});
		this.#pending = [];
		this.#globalError = null;
	}

	/**
	 * Register a callback for reload failures. Fires once per failed commit
	 * with the MuJoCo error string. Returns a dispose function. Multiple
	 * subscribers supported; typical use is a single page-level toast.
	 */
	onError(cb: (msg: string) => void): () => void {
		this.#errorHandlers.add(cb);
		return () => {
			this.#errorHandlers.delete(cb);
		};
	}

	#errorHandlers = new Set<(msg: string) => void>();

	#emitError(msg: string): void {
		for (const cb of this.#errorHandlers) {
			try {
				cb(msg);
			} catch {
				/* toast callback should never throw but don't let it break recovery */
			}
		}
	}

	/**
	 * Enqueue a commit at the end of the serialization chain. Concurrent calls
	 * (user types quickly while a previous reload is still in flight) are run
	 * sequentially — prevents the stale-state / stuck-error class of bugs the
	 * user saw where one bad edit poisoned every later edit.
	 */
	#enqueueCommit(nextEdits: PendingEdit[]): Promise<void> {
		const work = this.#commitChain.then(() => this.#commit(nextEdits));
		// Swallow rejections so a single failure doesn't break the chain — the
		// `#commit` method catches + reports internally.
		this.#commitChain = work.catch(() => {
			/* already handled */
		});
		return work;
	}

	async #commit(nextEdits: PendingEdit[]): Promise<void> {
		const baseline = this.#baselineFiles;
		const sim = this.#sim;
		if (!baseline || !sim) {
			this.#log('warn', 'commit aborted — no baseline / sim');
			return;
		}
		// Snapshot the pre-commit pending list so we can roll back on failure.
		// A failed edit must NOT stick in pending, otherwise every subsequent
		// edit's replay would include the bad op and fail forever.
		const prevPending = this.#pending;

		const replayResult = replay(baseline, this.#sourceFile, nextEdits);
		const stamped = nextEdits.map((e, i) => ({
			...e,
			status: replayResult.statuses[i].status,
			error: replayResult.statuses[i].error
		}));

		this.#pending = stamped;
		this.#applying = true;
		const validCount = stamped.filter((e) => e.status === 'ok').length;
		try {
			await sim.reloadFromFiles(replayResult.files);
			this.#lastValidDraftFiles = replayResult.files;
			this.#globalError = null;
			const totalChars = [...replayResult.files.values()].reduce((n, s) => n + s.length, 0);
			this.#log(
				'debug',
				`commit ok — ${validCount}/${stamped.length} valid, ${replayResult.files.size} file(s), ${totalChars} chars`
			);
		} catch (e) {
			const fullMsg = e instanceof Error ? e.message : String(e);
			const { short } = shortenMujocoError(fullMsg);
			this.#log('error', `commit: reload failed — ${fullMsg}`);
			this.#globalError = fullMsg;
			// Roll back pending first so the UI stops showing the failing edit.
			this.#pending = prevPending;
			// Three-tier recovery so one bad compile can't leave the sim dead:
			//   1. lastValidDraft — the files that were in the sim a moment ago
			//   2. baseline       — the pristine scene (drop all pending)
			//   3. give up        — session will need a scene reload, but the
			//                       app still runs and further edits can try
			const recovered = await this.#recoverSim(sim, baseline);
			if (!recovered) {
				// Pending is now stale (we couldn't reload lastValid); wipe it
				// so subsequent edits at least have a chance.
				this.#pending = [];
			}
			this.#emitError(short);
		} finally {
			this.#applying = false;
		}
	}

	async #recoverSim(
		sim: MujocoSimState,
		baseline: Map<string, string>
	): Promise<boolean> {
		const candidates: Array<{ label: string; files: Map<string, string> }> = [];
		if (
			this.#lastValidDraftFiles &&
			!sameFileMaps(this.#lastValidDraftFiles, baseline)
		) {
			candidates.push({ label: 'lastValid', files: this.#lastValidDraftFiles });
		}
		candidates.push({ label: 'baseline', files: baseline });
		for (const c of candidates) {
			try {
				await sim.reloadFromFiles(c.files);
				if (c.label === 'baseline') {
					// We had to discard pending to recover — flag that fact so the
					// lastValidDraft doesn't keep pointing at a poisoned map.
					this.#lastValidDraftFiles = baseline;
				}
				return true;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.#log('warn', `recovery via ${c.label} failed: ${msg}`);
			}
		}
		return false;
	}
}

function sameFileMaps(a: Map<string, string>, b: Map<string, string>): boolean {
	if (a === b) return true;
	if (a.size !== b.size) return false;
	for (const [k, v] of a) if (b.get(k) !== v) return false;
	return true;
}

/** Human-readable one-liner for an edit (used in console + diff list). */
export function editLabel(e: PendingEdit): string {
	const id = `${e.target.tagName}${e.target.name ? `[name="${e.target.name}"]` : `#${e.target.baselineIndex}`}`;
	switch (e.op.kind) {
		case 'setAttr':
			return `${id} ${e.op.attr}: ${formatVal(e.op.before)} → ${formatVal(e.op.after)}`;
		case 'removeAttr':
			return `${id} ${e.op.attr}: removed (was ${formatVal(e.op.before)})`;
		case 'rename':
			return `${id} name: ${formatVal(e.op.before)} → ${formatVal(e.op.after)}`;
		case 'removeElement':
			return `${id} — removed`;
	}
}

function formatVal(v: string | null): string {
	if (v === null) return '∅';
	return `"${v}"`;
}

function recLabel(rec: XmlEntityRecord): string {
	return `${rec.tagName}#${rec.index}${rec.name ? ` name="${rec.name}"` : ''}`;
}

export const editSession = new EditSession();
