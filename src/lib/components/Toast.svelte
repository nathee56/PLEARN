<script>
	import { toasts } from '$lib/stores/toast';

	let toastList = $state([]);
	const unsub = toasts.subscribe((v) => (toastList = v));

	import { onDestroy } from 'svelte';
	onDestroy(() => unsub());
</script>

{#if toastList.length > 0}
	<div class="toast-container" aria-live="polite">
		{#each toastList as toast (toast.id)}
			<div class="toast-item {toast.type}" class:toast-exit={!toast.visible}>
				<span class="toast-icon">
					{#if toast.type === 'success'}✓
					{:else if toast.type === 'error'}✕
					{:else}ℹ
					{/if}
				</span>
				<span class="toast-msg">{toast.message}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
		display: flex; flex-direction: column-reverse; gap: 8px;
		z-index: 9999; pointer-events: none;
		max-width: 400px; width: calc(100% - 32px);
	}

	.toast-item {
		display: flex; align-items: center; gap: 10px;
		padding: 12px 20px; border-radius: var(--radius-lg);
		background: var(--color-text); color: var(--color-bg);
		font-size: 14px; font-weight: 600;
		box-shadow: var(--shadow-elevated);
		animation: toastIn 0.3s var(--ease-spring) forwards;
		pointer-events: auto;
	}

	.toast-item.success .toast-icon { color: #34C759; }
	.toast-item.error .toast-icon { color: #FF3B30; }
	.toast-item.info .toast-icon { color: #007AFF; }

	.toast-icon {
		width: 20px; height: 20px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 12px; font-weight: 800; flex-shrink: 0;
	}

	.toast-msg { flex: 1; line-height: 1.3; }

	.toast-exit { animation: toastOut 0.3s var(--ease-out) forwards; }

	@keyframes toastIn {
		from { opacity: 0; transform: translateY(12px) scale(0.95); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}
	@keyframes toastOut {
		from { opacity: 1; transform: translateY(0) scale(1); }
		to { opacity: 0; transform: translateY(-8px) scale(0.95); }
	}

	@media (max-width: 640px) {
		.toast-container { bottom: 72px; /* Above mobile bottom nav */ }
	}
</style>
