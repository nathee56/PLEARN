<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { db } from '$lib/firebase';
	import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
	import PostCard from '$lib/components/PostCard.svelte';

	let searchQuery = $state('');
	let allPosts = $state([]);
	let allUsers = $state([]);
	
	let filteredPosts = $state([]);
	let filteredUsers = $state([]);
	
	let isLoading = $state(true);

	// Watch URL changes for new searches
	$effect(() => {
		let q = $page.url.searchParams.get('q') || '';
		if (q !== searchQuery) {
			searchQuery = q;
			applySearch();
		}
	});

	onMount(async () => {
		searchQuery = $page.url.searchParams.get('q') || '';
		await fetchAllData();
		applySearch();
	});

	async function fetchAllData() {
		isLoading = true;
		try {
			// Fetch recent 100 posts to search locally (Firestore doesn't support full-text search natively)
			const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
			const postSnap = await getDocs(qPosts);
			allPosts = postSnap.docs.map(d => ({ id: d.id, ...d.data() }));

			// Fetch users
			const qUsers = query(collection(db, 'users'), limit(50));
			const userSnap = await getDocs(qUsers);
			allUsers = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
		} catch (error) {
			console.error("Error fetching for search:", error);
		} finally {
			isLoading = false;
		}
	}

	function applySearch() {
		const term = searchQuery.toLowerCase().trim();
		if (!term) {
			filteredPosts = [];
			filteredUsers = [];
			return;
		}

		filteredUsers = allUsers.filter(u => 
			u.displayName?.toLowerCase().includes(term) || 
			u.email?.toLowerCase().includes(term)
		);

		filteredPosts = allPosts.filter(p => 
			(p.title && p.title.toLowerCase().includes(term)) || 
			(p.content && p.content.toLowerCase().includes(term)) ||
			(p.authorName && p.authorName.toLowerCase().includes(term))
		);
	}
</script>

<svelte:head>
	<title>ผลการค้นหา: {searchQuery} | PLEARN</title>
</svelte:head>

<div class="search-page">
	<div class="classic-card search-header">
		<h1 class="s-title">ผลการค้นหาสำหรับ "{searchQuery}"</h1>
	</div>

	{#if isLoading}
		<div class="loading-state">กำลังค้นหาข้อมูล...</div>
	{:else}
		<!-- Users Results -->
		{#if filteredUsers.length > 0}
			<h2 class="section-heading">ผู้ใช้</h2>
			<div class="users-grid">
				{#each filteredUsers as u}
					<div class="classic-card user-card">
						{#if u.photoURL}
							<img src={u.photoURL} alt="" class="u-avatar" referrerpolicy="no-referrer" />
						{:else}
							<div class="u-avatar placeholder">{(u.displayName || 'U').charAt(0)}</div>
						{/if}
						<div class="u-info">
							<div class="u-name">
								{u.displayName}
								{#if u.role === 'admin'}
									<span class="badge-verified" title="PLEARN Verified">
										<svg viewBox="0 0 24 24" fill="#0866FF" width="14" height="14"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/><circle cx="12" cy="12" r="10"/><path d="M10.1 16.7l-4.1-4.1 1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/></svg>
									</span>
								{/if}
							</div>
							<div class="u-status">{u.role === 'admin' ? 'ทีมงาน PLEARN' : 'สมาชิกเพลิน'}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Posts Results -->
		<h2 class="section-heading">โพสต์ที่เกี่ยวข้อง</h2>
		{#if filteredPosts.length > 0}
			<div class="posts-list">
				{#each filteredPosts as post (post.id)}
					<PostCard {post} />
				{/each}
			</div>
		{:else}
			<div class="classic-card empty-state">
				<span class="empty-icon">🔍</span>
				<h3 class="empty-title">ไม่พบโพสต์ที่ตรงกัน</h3>
				<p class="empty-sub">ลองเปลี่ยนคำค้นหาเป็นคำอื่นดูสิ</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.search-page { max-width: 680px; width: 100%; margin: 0 auto; padding-top: 1rem; padding-bottom: 2rem;}
	
	.search-header { padding: 1.5rem; margin-bottom: 1.5rem; }
	.s-title { font-size: 1.5rem; font-weight: 800; }
	
	.section-heading { font-size: 1.25rem; font-weight: 700; margin: 1.5rem 0 0.75rem 0.5rem; }
	
	.users-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 2rem;}
	.user-card { display: flex; align-items: center; gap: 1rem; padding: 1rem; }
	.u-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
	.u-avatar.placeholder { background: var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold;}
	.u-info { display: flex; flex-direction: column; }
	.u-name { font-weight: 700; font-size: 1.0625rem; display: flex; align-items: center; gap: 4px; }
	.u-status { font-size: 0.8125rem; color: var(--color-text-secondary); }
	
	.badge-verified { display: flex; align-items: center; margin-left: 2px;}

	.posts-list { display: flex; flex-direction: column; gap: 1rem; }
	
	.empty-state { padding: 3rem 1rem; text-align: center; }
	.empty-icon { font-size: 3rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;}
	.empty-title { font-weight: 700; font-size: 1.125rem; margin-bottom: 0.25rem; }
	.empty-sub { color: var(--color-text-muted); font-size: 0.9375rem;}
	
	.loading-state { text-align: center; padding: 3rem; color: var(--color-text-muted); font-size: 1.125rem; }
</style>
