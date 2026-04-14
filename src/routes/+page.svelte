<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { currentUser, userData } from '$lib/stores/auth';
	import {
		collection, query, where, orderBy, onSnapshot, getDocs, limit, startAfter
	} from 'firebase/firestore';
	import PostCard from '$lib/components/PostCard.svelte';
	import CreatePost from '$lib/components/CreatePost.svelte';

	const POSTS_PER_PAGE = 10;

	let activeTab = $state('general');
	let realtimePosts = $state([]);
	let olderPosts = $state([]);
	let showCreatePost = $state(false);
	let isLoadingPosts = $state(true);
	let isLoadingMore = $state(false);
	let hasMore = $state(true);
	let lastDoc = null;

	// Deduplicated combined posts
	let posts = $derived.by(() => {
		const ids = new Set(realtimePosts.map(p => p.id));
		const filtered = olderPosts.filter(p => !ids.has(p.id));
		const combined = [...realtimePosts, ...filtered];
		return combined.sort((a, b) => {
			if (a.isPinned && !b.isPinned) return -1;
			if (!a.isPinned && b.isPinned) return 1;
			return 0;
		});
	});

	let user = $state(null);
	let userInfo = $state(null);
	let unsubPosts;

	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => (userInfo = v));

	// IntersectionObserver for auto load more
	let loadMoreTrigger = $state(null);
	let observer;

	$effect(() => {
		if (loadMoreTrigger && hasMore && !isLoadingMore && !isLoadingPosts) {
			if (observer) observer.disconnect();
			observer = new IntersectionObserver((entries) => {
				if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
					loadMorePosts();
				}
			}, { rootMargin: '200px' });
			observer.observe(loadMoreTrigger);

			return () => {
				if (observer) observer.disconnect();
			};
		}
	});

	function subscribeToPosts(type) {
		if (unsubPosts) unsubPosts();
		isLoadingPosts = true;
		realtimePosts = [];
		olderPosts = [];
		lastDoc = null;
		hasMore = true;

		const postsRef = collection(db, 'posts');
		const q = query(
			postsRef,
			where('type', '==', type),
			orderBy('createdAt', 'desc'),
			limit(POSTS_PER_PAGE)
		);

		unsubPosts = onSnapshot(q, (snapshot) => {
			realtimePosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
			
			// Track the last document for pagination cursor
			if (snapshot.docs.length > 0) {
				lastDoc = snapshot.docs[snapshot.docs.length - 1];
			}
			
			// If we got fewer than POSTS_PER_PAGE, no more to load
			hasMore = snapshot.docs.length >= POSTS_PER_PAGE;
			isLoadingPosts = false;
		}, (error) => {
			console.error('Error fetching posts:', error);
			isLoadingPosts = false;
		});
	}

	async function loadMorePosts() {
		if (!lastDoc || isLoadingMore || !hasMore) return;
		isLoadingMore = true;

		try {
			const postsRef = collection(db, 'posts');
			const q = query(
				postsRef,
				where('type', '==', activeTab),
				orderBy('createdAt', 'desc'),
				startAfter(lastDoc),
				limit(POSTS_PER_PAGE)
			);

			const snapshot = await getDocs(q);
			const morePosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

			if (snapshot.docs.length > 0) {
				lastDoc = snapshot.docs[snapshot.docs.length - 1];
			}

			hasMore = snapshot.docs.length >= POSTS_PER_PAGE;
			olderPosts = [...olderPosts, ...morePosts];
		} catch (error) {
			console.error('Error loading more posts:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	onMount(() => {
		subscribeToPosts(activeTab);
		const handleOpenCreate = (/** @type {CustomEvent} */ e) => {
			const type = e.detail?.type || activeTab;
			if (activeTab !== type) switchTab(type);
			showCreatePost = true;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		};
		window.addEventListener('open-create-post', handleOpenCreate);

		return () => {
			window.removeEventListener('open-create-post', handleOpenCreate);
		};
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
		if (unsubPosts) unsubPosts();
		if (observer) observer.disconnect();
	});

	function switchTab(tab) {
		if (activeTab === tab) return;
		activeTab = tab;
		subscribeToPosts(tab);
	}
</script>

<div class="feed-page">
	<!-- Classic Feed Tabs -->
	<div class="classic-card feed-tabs-container">
		<button class="feed-tab" class:active={activeTab === 'general'} onclick={() => switchTab('general')}>
			หน้าฟีด (ทั่วไป)
		</button>
		<button class="feed-tab" class:active={activeTab === 'thread'} onclick={() => switchTab('thread')}>
			กระทู้
		</button>
	</div>

	<!-- Create Post Box (Mini version that expands on click) -->
	{#if user}
		{#if showCreatePost}
			<div class="create-wrapper animate-slide-up">
				<CreatePost postType={activeTab} onClose={() => (showCreatePost = false)} />
			</div>
		{:else}
			<div class="classic-card create-prompt" onclick={() => (showCreatePost = true)}>
				{#if userInfo?.photoURL}
					<img src={userInfo.photoURL} alt="" class="cp-avatar" referrerpolicy="no-referrer" />
				{:else}
					<div class="cp-avatar-placeholder">{(userInfo?.displayName || 'U').charAt(0)}</div>
				{/if}
				<div class="cp-input-fake">
					{#if activeTab === 'general'}
						คุณกำลังคิดอะไรอยู่ {userInfo?.displayName?.split(' ')[0] || ''}?
					{:else if activeTab === 'thread'}
						เริ่มตั้งกระทู้ใหม่ของคุณ...
					{/if}
				</div>
			</div>
		{/if}
	{/if}

	<!-- Post Feed -->
	<div class="posts-feed">
		{#if isLoadingPosts}
			<!-- Classic Skeleton -->
			{#each Array(3) as _}
				<div class="classic-card skel-wrapper">
					<div class="skel-head">
						<div class="skel-circle"></div>
						<div class="skel-lines"><div class="skel-l w-40"></div><div class="skel-l w-20"></div></div>
					</div>
					<div class="skel-body">
						<div class="skel-l w-full"></div><div class="skel-l w-90"></div>
					</div>
				</div>
			{/each}
		{:else if posts.length === 0}
			<div class="classic-card empty-state">
				<span class="empty-icon">📂</span>
				<h3 class="empty-title">ไม่มีโพสต์ในหมวดหมู่นี้</h3>
				<p class="empty-sub">เป็นคนแรกที่เริ่มต้นบทสนทนาสิ</p>
			</div>
		{:else}
			<div class="feed-grid">
				{#each posts as post (post.id)}
					<PostCard {post} />
				{/each}
			</div>

			<!-- Load More Trigger & Button -->
			{#if hasMore}
				<div class="load-more-area" bind:this={loadMoreTrigger}>
					{#if isLoadingMore}
						<div class="load-more-spinner">
							<div class="spinner-small"></div>
							<span>กำลังโหลดเพิ่มเติม...</span>
						</div>
					{:else}
						<button class="load-more-btn" onclick={loadMorePosts}>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="7 13 12 18 17 13"/>
								<polyline points="7 6 12 11 17 6"/>
							</svg>
							โหลดโพสต์เพิ่มเติม
						</button>
					{/if}
				</div>
			{:else if posts.length > POSTS_PER_PAGE}
				<div class="end-of-feed">
					<span class="end-icon">✨</span>
					<span>คุณดูโพสต์ทั้งหมดแล้ว</span>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.feed-page { max-width: 590px; width: 100%; margin: 0 auto; }

	/* Segmented Control Tabs (White Block Style) */
	.feed-tabs-container {
		display: flex; margin-bottom: 12px;
		position: sticky; top: 52px; z-index: 40;
		background: var(--color-bg-card); padding: 6px;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		margin-top: 12px;
	}
	.feed-tab {
		flex: 1; padding: 10px 16px; font-weight: 600; font-size: 14px;
		color: var(--color-text-muted); background: none; border: none;
		cursor: pointer; position: relative; transition: color 0.15s, background 0.15s;
		text-align: center; border-radius: var(--radius-md); margin: 0 4px;
	}
	.feed-tab:first-child { margin-left: 0; }
	.feed-tab:last-child { margin-right: 0; }
	.feed-tab:hover { color: var(--color-text); }
	.feed-tab.active { color: var(--color-text); background: var(--color-bg-input); }

	/* Create Post Prompt */
	.create-prompt {
		display: flex; align-items: center; gap: 12px; padding: 12px 16px;
		margin-bottom: 12px; cursor: pointer;
		transition: background 0.12s var(--ease-out);
	}
	.create-prompt:hover { background-color: var(--color-bg-hover); }
	.cp-avatar { width: 36px; height: 36px; border-radius: 50%; }
	.cp-avatar-placeholder {
		width: 36px; height: 36px; border-radius: 50%;
		background: var(--color-primary); color: white;
		display: flex; align-items: center; justify-content: center;
		font-weight: 700; font-size: 14px;
	}
	.cp-input-fake {
		flex: 1; padding: 8px 16px; background-color: var(--color-bg-input);
		color: var(--color-text-muted); border-radius: var(--radius-full);
		font-size: 14px; cursor: pointer;
		transition: background 0.12s var(--ease-out);
	}
	.cp-input-fake:hover { background-color: var(--color-bg-hover); }

	.create-wrapper { margin-bottom: 12px; }
	.feed-grid { display: flex; flex-direction: column; gap: 12px; }

	/* Shimmer Skeleton */
	.skel-wrapper { padding: 16px; margin-bottom: 12px; }
	.skel-head { display: flex; gap: 12px; margin-bottom: 16px; }
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

	/* Empty State */
	.empty-state { padding: 48px 16px; text-align: center; }
	.empty-icon { font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.4; }
	.empty-title { font-weight: 700; font-size: 17px; margin-bottom: 4px; color: var(--color-text); }
	.empty-sub { color: var(--color-text-muted); font-size: 14px; }

	/* Load More */
	.load-more-area { display: flex; justify-content: center; padding: 24px 0; }
	.load-more-btn {
		display: flex; align-items: center; gap: 6px;
		padding: 10px 20px; border-radius: var(--radius-full);
		background: var(--color-bg-card); border: 1px solid var(--color-border-light);
		color: var(--color-primary); font-weight: 600; font-size: 14px;
		cursor: pointer; transition: all 0.15s var(--ease-out);
		box-shadow: var(--shadow-card);
	}
	.load-more-btn:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-elevated);
		transform: translateY(-1px);
	}
	.load-more-btn:active { transform: translateY(0); }

	.load-more-spinner {
		display: flex; align-items: center; gap: 8px;
		color: var(--color-text-muted); font-size: 13px;
	}
	.spinner-small {
		width: 18px; height: 18px;
		border: 2px solid var(--color-border-light);
		border-top-color: var(--color-primary);
		border-radius: 50%; animation: spin-small 0.7s linear infinite;
	}
	@keyframes spin-small { to { transform: rotate(360deg); } }

	.end-of-feed {
		display: flex; align-items: center; justify-content: center; gap: 6px;
		padding: 24px; color: var(--color-text-muted); font-size: 13px;
	}
	.end-icon { font-size: 14px; }

	@media (max-width: 640px) {
		.feed-page { max-width: 100%; padding: 0 8px; }
		.feed-tabs-container { border-radius: 0; margin-bottom: 8px; }
	}
</style>
