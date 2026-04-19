<!--
@component
FloatingPanel.Root

Absolutely-positioned panel that can be dragged (from its Header),
collapsed, and optionally closed. Sibling panels share a z-index stack so
the last-clicked panel rises to the top.

Position is viewport-relative (x/y are css px measured from the nearest
positioned ancestor — use a `relative` wrapper in the parent). Bindable
props let callers persist layout if they want.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { onMount } from 'svelte';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import {
		getFloatingPanelStack,
		setFloatingPanelApi,
		type FloatingPanelApi
	} from './context.svelte.js';

	export type FloatingPanelPosition =
		| 'top-left'
		| 'top-center'
		| 'top-right'
		| 'center-left'
		| 'center'
		| 'center-right'
		| 'bottom-left'
		| 'bottom-center'
		| 'bottom-right';

	type Props = WithElementRef<Omit<HTMLAttributes<HTMLDivElement>, 'onclose'>> & {
		/** Left offset in px from the nearest positioned ancestor. */
		x?: number;
		/** Top offset in px from the nearest positioned ancestor. */
		y?: number;
		/** Dock to a parent-relative grid cell. Computed once on mount;
		 *  `x`/`y` are then owned by drag (or the parent's binding). */
		position?: FloatingPanelPosition;
		/** Distance in px from the edges when `position` docks the panel. */
		margin?: number;
		/** Push the docked panel further from its anchor, in screen-space px
		 *  (positive = down/right). Applied on top of the `position` + margin
		 *  calculation, clamped so the panel stays inside the parent. Lets
		 *  callers stack panels on the same edge without overlaps. */
		offsetX?: number;
		offsetY?: number;
		/** Fixed panel width in px. `undefined` lets content dictate width. */
		width?: number;
		/** Fixed panel height in px. Overrides any intrinsic sizing. */
		height?: number;
		/** Upper bound on panel height; body scrolls inside when exceeded. */
		maxHeight?: string;
		/** Upper bound on panel width. Useful when `width` is not set. */
		maxWidth?: string;
		/** Lower bound on panel width. */
		minWidth?: string;
		/** Lower bound on panel height. */
		minHeight?: string;
		/** True when the body is hidden and only the header is shown. */
		collapsed?: boolean;
		/** False hides the panel entirely (only relevant when `closable`). */
		open?: boolean;
		/** When true, Header renders a close button that toggles `open`. */
		closable?: boolean;
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		x = $bindable(16),
		y = $bindable(16),
		position,
		margin = 16,
		offsetX = 0,
		offsetY = 0,
		width,
		height,
		maxHeight = '70vh',
		maxWidth,
		minWidth,
		minHeight,
		collapsed = $bindable(false),
		open = $bindable(true),
		closable = false,
		children,
		...restProps
	}: Props = $props();

	const stack = getFloatingPanelStack();
	let zIndex = $state(stack.bump());

	function bringToFront() {
		zIndex = stack.bump();
	}

	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let panelStartX = 0;
	let panelStartY = 0;
	let dragPointerId = -1;
	// Once the user has meaningfully moved the panel, stop auto-docking it.
	// A simple header click (no movement) doesn't count — set this only after
	// the pointer has travelled a few px.
	let userPositioned = $state(false);

	function parentSize(): { width: number; height: number } {
		if (!ref) {
			return {
				width: typeof window !== 'undefined' ? window.innerWidth : 0,
				height: typeof window !== 'undefined' ? window.innerHeight : 0
			};
		}
		const parent = ref.offsetParent as HTMLElement | null;
		return {
			width: parent?.clientWidth ?? window.innerWidth,
			height: parent?.clientHeight ?? window.innerHeight
		};
	}

	function clampToParent(nextX: number, nextY: number): { x: number; y: number } {
		if (!ref) return { x: nextX, y: nextY };
		const rect = ref.getBoundingClientRect();
		const { width: pw, height: ph } = parentSize();
		const maxX = Math.max(0, pw - rect.width);
		const maxY = Math.max(0, ph - rect.height);
		return {
			x: Math.min(Math.max(nextX, 0), maxX),
			y: Math.min(Math.max(nextY, 0), maxY)
		};
	}

	function startDrag(e: PointerEvent) {
		if (e.button !== 0) return;
		const header = e.currentTarget as HTMLElement;
		header.setPointerCapture(e.pointerId);
		dragging = true;
		dragPointerId = e.pointerId;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		panelStartX = x;
		panelStartY = y;
		bringToFront();
	}

	function handleWindowPointerMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== dragPointerId) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		if (!userPositioned && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) userPositioned = true;
		const next = clampToParent(panelStartX + dx, panelStartY + dy);
		x = next.x;
		y = next.y;
	}

	function handleWindowPointerUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== dragPointerId) return;
		dragging = false;
		dragPointerId = -1;
	}

	function dockToPosition() {
		if (!position || !ref) return;
		const rect = ref.getBoundingClientRect();
		const { width: pw, height: ph } = parentSize();
		const availX = Math.max(0, pw - rect.width);
		const availY = Math.max(0, ph - rect.height);
		const [v, h] = position.split('-') as [string, string | undefined];
		const vert = v;
		const horiz = h ?? v;
		const anchorX =
			horiz === 'left' ? margin : horiz === 'right' ? availX - margin : Math.round(availX / 2);
		const anchorY =
			vert === 'top' ? margin : vert === 'bottom' ? availY - margin : Math.round(availY / 2);
		const next = clampToParent(anchorX + offsetX, anchorY + offsetY);
		x = next.x;
		y = next.y;
	}

	// Re-dock whenever the parent viewport changes size, as long as the user
	// hasn't manually positioned it. Observing only the *parent* (not the
	// panel itself) keeps collapse/expand animations from re-docking mid-
	// transition — when a panel is anchored to `bottom`/`right`, CSS handles
	// the shrink/grow naturally via the edge offset below.
	$effect(() => {
		if (!position || !ref || userPositioned) return;
		margin;
		offsetX;
		offsetY;

		const node = ref;
		const parent = node.offsetParent as HTMLElement | null;

		const schedule = () => {
			if (userPositioned) return;
			requestAnimationFrame(dockToPosition);
		};

		const ro = new ResizeObserver(schedule);
		if (parent) ro.observe(parent);
		window.addEventListener('resize', schedule);
		schedule();

		return () => {
			ro.disconnect();
			window.removeEventListener('resize', schedule);
		};
	});

	onMount(() => {
		window.addEventListener('pointermove', handleWindowPointerMove);
		window.addEventListener('pointerup', handleWindowPointerUp);
		window.addEventListener('pointercancel', handleWindowPointerUp);
		return () => {
			window.removeEventListener('pointermove', handleWindowPointerMove);
			window.removeEventListener('pointerup', handleWindowPointerUp);
			window.removeEventListener('pointercancel', handleWindowPointerUp);
		};
	});

	// When the panel is auto-docked (user hasn't dragged), pin it to the CSS
	// edge that matches the `position` anchor. This keeps the *anchor edge*
	// stable as the panel grows/shrinks (e.g. a Pane.Folder collapse inside a
	// `bottom-right` panel no longer tears the top edge around). After the
	// user drags, fall back to left/top offsets so the drag math stays simple.
	const anchor = $derived.by(() => {
		if (!position) return { horiz: 'left' as const, vert: 'top' as const };
		const [v, h] = position.split('-') as [string, string | undefined];
		const horiz = (h ?? v) === 'right' ? 'right' : 'left';
		const vert = v === 'bottom' ? 'bottom' : 'top';
		return { horiz, vert };
	});

	const horizEdgeStyle = $derived.by(() => {
		if (userPositioned || !position) return { prop: 'left' as const, value: `${x}px` };
		const px = Math.max(0, margin - offsetX);
		return { prop: anchor.horiz, value: `${px}px` };
	});
	const vertEdgeStyle = $derived.by(() => {
		if (userPositioned || !position) return { prop: 'top' as const, value: `${y}px` };
		const px = Math.max(0, margin + (anchor.vert === 'top' ? offsetY : -offsetY));
		return { prop: anchor.vert, value: `${px}px` };
	});

	const api: FloatingPanelApi = {
		get collapsed() {
			return collapsed;
		},
		toggleCollapsed() {
			collapsed = !collapsed;
		},
		get closable() {
			return closable;
		},
		close() {
			open = false;
		},
		startDrag,
		get maxHeight() {
			return maxHeight;
		},
		get minHeight() {
			return minHeight;
		},
		resetPosition() {
			if (!position) return;
			userPositioned = false;
			if (ref) requestAnimationFrame(dockToPosition);
		}
	};

	setFloatingPanelApi(api);
</script>

{#if open}
	<div
		bind:this={ref}
		data-slot="floating-panel"
		data-state={collapsed ? 'collapsed' : 'expanded'}
		data-dragging={dragging ? '' : undefined}
		class={cn(
			'bg-card text-card-foreground ring-foreground/10 pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg shadow-lg ring-1 select-none',
			'data-[dragging]:cursor-grabbing',
			className
		)}
		style:left={horizEdgeStyle.prop === 'left' ? horizEdgeStyle.value : undefined}
		style:right={horizEdgeStyle.prop === 'right' ? horizEdgeStyle.value : undefined}
		style:top={vertEdgeStyle.prop === 'top' ? vertEdgeStyle.value : undefined}
		style:bottom={vertEdgeStyle.prop === 'bottom' ? vertEdgeStyle.value : undefined}
		style:width={width ? `${width}px` : undefined}
		style:height={height ? `${height}px` : undefined}
		style:max-width={maxWidth}
		style:min-width={minWidth}
		style:z-index={zIndex}
		onpointerdowncapture={bringToFront}
		{...restProps}
	>
		{@render children?.()}
	</div>
{/if}
