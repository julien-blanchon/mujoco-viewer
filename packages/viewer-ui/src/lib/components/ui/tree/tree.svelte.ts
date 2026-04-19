import { getContext, setContext } from "svelte";

type Accessor<T> = () => T;
type Setter<T> = (value: T) => void;

export class TreeState<TValue = string> {
	#selected: Accessor<TValue | null>;
	#setSelected: Setter<TValue | null>;
	#onRename: Accessor<((value: TValue, name: string) => void) | undefined>;

	editingId = $state<TValue | null>(null);

	constructor(opts: {
		selected: Accessor<TValue | null>;
		setSelected: Setter<TValue | null>;
		onRename: Accessor<((value: TValue, name: string) => void) | undefined>;
	}) {
		this.#selected = opts.selected;
		this.#setSelected = opts.setSelected;
		this.#onRename = opts.onRename;
	}

	get selected(): TValue | null {
		return this.#selected();
	}
	set selected(v: TValue | null) {
		this.#setSelected(v);
	}

	isSelected(value: TValue): boolean {
		const s = this.selected;
		return s !== null && s === value;
	}

	isEditing(value: TValue): boolean {
		const e = this.editingId;
		return e !== null && e === value;
	}

	/** Click behavior: clicking the selected item deselects; clicking another selects it. */
	select(value: TValue): void {
		this.selected = this.isSelected(value) ? null : value;
	}

	/** Begin inline rename for the given item. Implicitly selects it. */
	startEdit(value: TValue): void {
		this.editingId = value;
		this.selected = value;
	}

	commitEdit(name: string): void {
		const id = this.editingId;
		if (id !== null) this.#onRename()?.(id, name);
		this.editingId = null;
	}

	cancelEdit(): void {
		this.editingId = null;
	}
}

export class TreeItemState<TValue = string> {
	#value: Accessor<TValue>;
	#depth: Accessor<number>;
	#open: Accessor<boolean>;
	#setOpen: Setter<boolean>;

	/** Bumped by <Tree.Indicator> so <Tree.Item> can announce aria-expanded correctly. */
	hasChildren = $state<boolean>(false);

	constructor(opts: {
		value: Accessor<TValue>;
		depth: Accessor<number>;
		open: Accessor<boolean>;
		setOpen: Setter<boolean>;
	}) {
		this.#value = opts.value;
		this.#depth = opts.depth;
		this.#open = opts.open;
		this.#setOpen = opts.setOpen;
	}

	get value(): TValue {
		return this.#value();
	}

	get depth(): number {
		return this.#depth();
	}

	get open(): boolean {
		return this.#open();
	}
	set open(v: boolean) {
		this.#setOpen(v);
	}
}

const TREE_KEY = Symbol("shadcn-tree");
const ITEM_KEY = Symbol("shadcn-tree-item");
const DEPTH_KEY = Symbol("shadcn-tree-depth");

export function setTreeState<T>(s: TreeState<T>): TreeState<T> {
	setContext(TREE_KEY, s);
	return s;
}

export function getTreeState<T = string>(): TreeState<T> {
	const ctx = getContext<TreeState<T>>(TREE_KEY);
	if (!ctx) throw new Error("Tree primitives must be used inside <Tree.Root>");
	return ctx;
}

export function setTreeItemState<T>(s: TreeItemState<T>): TreeItemState<T> {
	setContext(ITEM_KEY, s);
	return s;
}

export function getTreeItemState<T = string>(): TreeItemState<T> {
	const ctx = getContext<TreeItemState<T>>(ITEM_KEY);
	if (!ctx) throw new Error("Tree item primitives must be used inside <Tree.Item>");
	return ctx;
}

/** Depth is propagated via context so items auto-indent without the caller tracking it. */
export function setDepth(d: number): void {
	setContext(DEPTH_KEY, d);
}

export function getDepth(): number {
	return (getContext(DEPTH_KEY) as number | undefined) ?? -1;
}
