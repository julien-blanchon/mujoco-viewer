<!--
@component
LoadingOverlay — full-canvas cover shown until the scene is ready. Takes its
state as props so it can live outside the `<Canvas>` tree.
-->
<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import {
		Alert,
		AlertDescription,
		AlertTitle
	} from '$lib/components/ui/alert/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import AlertCircleIcon from '@lucide/svelte/icons/circle-alert';

	let {
		status,
		loadProgress,
		error
	}: {
		status: 'loading' | 'ready' | 'error';
		loadProgress: string | null;
		error: string | null;
	} = $props();
</script>

{#if status !== 'ready'}
	<div
		data-status={status}
		class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm"
	>
		{#if status === 'error'}
			<Alert
				variant="destructive"
				class="pointer-events-auto max-w-lg shadow-2xl"
			>
				<AlertCircleIcon />
				<AlertTitle>Failed to load scene</AlertTitle>
				<AlertDescription>
					<pre
						class="max-h-64 overflow-auto text-left text-xs whitespace-pre-wrap break-words">{error &&
						error.length > 0
							? error
							: 'See the browser console for details.'}</pre>
				</AlertDescription>
			</Alert>
		{:else}
			<Card class="pointer-events-auto shadow-2xl">
				<CardContent class="flex flex-col items-center gap-3 px-6 text-center">
					<Spinner class="size-6 text-primary" />
					<div class="text-sm font-medium">Loading scene…</div>
					<div class="min-h-5 text-xs text-muted-foreground tabular-nums">
						{loadProgress ?? ' '}
					</div>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
