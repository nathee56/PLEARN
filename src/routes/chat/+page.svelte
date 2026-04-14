<script>
	import GlobalChat from '$lib/components/GlobalChat.svelte';
</script>

<svelte:head>
	<title>แชทต้มยำ - PLEARN</title>
</svelte:head>

<div class="mobile-chat-page">
	<GlobalChat />
</div>

<style>
	.mobile-chat-page {
		width: 100%; height: 100%;
	}
	/* Overrides for mobile to make it fullscreen */
	:global(.mobile-chat-page .chat-container) {
		height: calc(100vh - 120px);
		max-height: none;
		border-radius: 0;
		border: none;
		position: static;
	}
	@media (min-width: 800px) {
		.mobile-chat-page {
			display: none; /* Hide on desktop as it's already in the sidebar */
		}
	}
</style>
