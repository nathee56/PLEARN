<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { db } from '$lib/firebase';
	import { doc, onSnapshot } from 'firebase/firestore';
	import PostCard from '$lib/components/PostCard.svelte';

	let postId = $derived($page.params.id);
	let post = $state(null);
	let isLoading = $state(true);
	let error = $state(null);
	let unsubPost;

	onMount(() => {
		loadPost();
	});

	$effect(() => {
		if (postId) {
			loadPost();
		}
	});

	function loadPost() {
		if (unsubPost) unsubPost();
		isLoading = true;
		error = null;

		const postRef = doc(db, 'posts', postId);
		unsubPost = onSnapshot(postRef, (snapshot) => {
			if (snapshot.exists()) {
				post = { id: snapshot.id, ...snapshot.data() };
			} else {
				error = 'ไม่พบโพสต์นี้ อาจถูกลบไปแล้ว';
				post = null;
			}
			isLoading = false;
		}, (err) => {
			console.error('Error loading post:', err);
			error = 'เกิดข้อผิดพลาดในการโหลดโพสต์';
			isLoading = false;
		});
	}

	onDestroy(() => {
		if (unsubPost) unsubPost();
	});
</script>

<svelte:head>
	<title>{post?.title || 'โพสต์'} | PLEARN</title>
</svelte:head>

<div class="post-detail-page">
	<div class="back-row">
		<a href="/" class="back-btn">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			<span>กลับหน้าฟีด</span>
		</a>
	</div>

	{#if isLoading}
		<div class="classic-card loading-state">
			<div class="skel-head">
				<div class="skel-circle"></div>
				<div class="skel-lines"><div class="skel-l w-40"></div><div class="skel-l w-20"></div></div>
			</div>
			<div class="skel-body">
				<div class="skel-l w-full"></div><div class="skel-l w-90"></div>
			</div>
		</div>
	{:else if error}
		<div class="classic-card error-state">
			<span class="error-icon">😔</span>
			<h3 class="error-title">{error}</h3>
			<a href="/" class="classic-btn btn-primary back-home-btn">กลับหน้าหลัก</a>
		</div>
	{:else if post}
		<PostCard {post} showCommentsDefault={true} />
	{/if}
</div>

<style>
	.post-detail-page {
		max-width: 590px; width: 100%; margin: 0 auto; padding-bottom: 32px;
	}

	.back-row { margin-bottom: 12px; }
	.back-btn {
		display: inline-flex; align-items: center; gap: 6px;
		color: var(--color-primary); text-decoration: none;
		font-weight: 600; font-size: 14px;
		padding: 8px 12px; border-radius: var(--radius-md);
		transition: background 0.12s var(--ease-out);
	}
	.back-btn:hover { background: var(--color-primary-soft); }

	.loading-state { padding: 20px; }
	.skel-head { display: flex; gap: 10px; margin-bottom: 16px; }
	.skel-circle {
		width: 36px; height: 36px; border-radius: 50%;
		background: linear-gradient(90deg, var(--color-bg-input) 25%, var(--color-bg-hover) 50%, var(--color-bg-input) 75%);
		background-size: 200% 100%; animation: shimmer 1.5s infinite;
	}
	.skel-lines { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
	.skel-l {
		height: 8px; border-radius: var(--radius-full);
		background: linear-gradient(90deg, var(--color-bg-input) 25%, var(--color-bg-hover) 50%, var(--color-bg-input) 75%);
		background-size: 200% 100%; animation: shimmer 1.5s infinite;
	}
	.skel-body { display: flex; flex-direction: column; gap: 8px; }
	.w-full { width: 100%; } .w-90 { width: 90%; } .w-40 { width: 40%; } .w-20 { width: 20%; }

	.error-state {
		padding: 48px 16px; text-align: center;
		display: flex; flex-direction: column; align-items: center; gap: 12px;
	}
	.error-icon { font-size: 32px; opacity: 0.4; }
	.error-title { font-weight: 700; font-size: 17px; color: var(--color-text-muted); }
	.back-home-btn { margin-top: 8px; }
</style>
