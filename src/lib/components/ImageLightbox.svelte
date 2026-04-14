<script>
	let { images = [], startIndex = 0, onClose = () => {} } = $props();
	let currentIndex = $state(startIndex);
	let isClosing = $state(false);

	function next() { currentIndex = (currentIndex + 1) % images.length; }
	function prev() { currentIndex = (currentIndex - 1 + images.length) % images.length; }

	function close() {
		isClosing = true;
		setTimeout(onClose, 200);
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowRight') next();
		if (e.key === 'ArrowLeft') prev();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="lightbox-overlay" class:closing={isClosing} onclick={close}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="lightbox-content" onclick={(e) => e.stopPropagation()}>
		<button class="lb-close" onclick={close} aria-label="ปิด">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</button>

		{#if images.length > 1}
			<button class="lb-nav lb-prev" onclick={prev} aria-label="ก่อนหน้า">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
			</button>
			<button class="lb-nav lb-next" onclick={next} aria-label="ถัดไป">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
			</button>
		{/if}

		<img src={images[currentIndex]} alt="รูปที่ {currentIndex + 1}" class="lb-image" />

		{#if images.length > 1}
			<div class="lb-counter">{currentIndex + 1} / {images.length}</div>
		{/if}
	</div>
</div>

<style>
	.lightbox-overlay {
		position: fixed; inset: 0; z-index: 10000;
		background: rgba(0, 0, 0, 0.92);
		display: flex; align-items: center; justify-content: center;
		animation: lbFadeIn 0.2s var(--ease-out) forwards;
		cursor: zoom-out;
	}
	.lightbox-overlay.closing { animation: lbFadeOut 0.2s var(--ease-out) forwards; }

	.lightbox-content {
		position: relative; max-width: 90vw; max-height: 90vh;
		display: flex; align-items: center; justify-content: center;
		cursor: default;
	}

	.lb-image {
		max-width: 90vw; max-height: 85vh; object-fit: contain;
		border-radius: var(--radius-md);
		animation: lbZoomIn 0.25s var(--ease-spring) forwards;
		user-select: none;
	}
	.closing .lb-image { animation: lbZoomOut 0.2s var(--ease-out) forwards; }

	.lb-close {
		position: fixed; top: 16px; right: 16px;
		width: 44px; height: 44px; border-radius: 50%;
		background: rgba(255, 255, 255, 0.1); border: none;
		color: white; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		transition: background 0.12s;
		z-index: 2;
	}
	.lb-close:hover { background: rgba(255, 255, 255, 0.2); }

	.lb-nav {
		position: fixed; top: 50%; transform: translateY(-50%);
		width: 44px; height: 44px; border-radius: 50%;
		background: rgba(255, 255, 255, 0.1); border: none;
		color: white; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		transition: all 0.12s var(--ease-out);
		z-index: 2;
	}
	.lb-nav:hover { background: rgba(255, 255, 255, 0.25); transform: translateY(-50%) scale(1.05); }
	.lb-prev { left: 16px; }
	.lb-next { right: 16px; }

	.lb-counter {
		position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
		background: rgba(255, 255, 255, 0.15); color: white;
		padding: 6px 16px; border-radius: var(--radius-full);
		font-size: 13px; font-weight: 600;
		backdrop-filter: blur(8px);
	}

	@keyframes lbFadeIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes lbFadeOut { from { opacity: 1; } to { opacity: 0; } }
	@keyframes lbZoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
	@keyframes lbZoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }

	@media (max-width: 640px) {
		.lb-nav { width: 36px; height: 36px; }
		.lb-prev { left: 8px; }
		.lb-next { right: 8px; }
	}
</style>
