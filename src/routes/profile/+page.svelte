<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { currentUser, userData } from '$lib/stores/auth';
	import { doc, updateDoc, getDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
	import PostCard from '$lib/components/PostCard.svelte';
	import { showToast } from '$lib/stores/toast';

	let user = $state(null);
	let userInfo = $state(null);
	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => (userInfo = v));

	let isEditing = $state(false);
	let editName = $state('');
	let isSaving = $state(false);

	let myPosts = $state([]);
	let isLoadingPosts = $state(true);
	let unsubPosts;
	let isProfileOnline = $state(false);
	let viewingUid = $state(null);

	onMount(() => {
		if (user) {
			loadUserPosts();
			isProfileOnline = true; // Current user is always online on own profile
		}
	});

	// Reactivity to load posts if user loads slightly after mount
	$effect(() => {
		if (user && !unsubPosts) {
			loadUserPosts();
		}
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
		if (unsubPosts) unsubPosts();
	});

	function loadUserPosts() {
		if (!user) return;
		isLoadingPosts = true;
		const postsRef = collection(db, 'posts');
		// Note: Requires composite index on authorUid and createdAt if ordered
		// Without index, might need to sort client side. For now, let's sort client side or use simple query.
		const q = query(
			postsRef,
			where('authorUid', '==', user.uid)
		);

		unsubPosts = onSnapshot(q, (snapshot) => {
			let fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
			fetched.sort((a, b) => (b.createdAt?.toMillis() || Date.now()) - (a.createdAt?.toMillis() || Date.now()));
			myPosts = fetched;
			isLoadingPosts = false;
		});
	}

	function toggleEdit() {
		if (!isEditing) {
			editName = userInfo?.displayName || '';
		}
		isEditing = !isEditing;
	}

	async function saveProfile() {
		if (!editName.trim() || !user) return;
		isSaving = true;
		try {
			const userRef = doc(db, 'users', user.uid);
			await updateDoc(userRef, {
				displayName: editName.trim()
			});
			userData.update(u => ({ ...u, displayName: editName.trim() }));
			isEditing = false;
			showToast('บันทึกโปรไฟล์แล้ว ✅', 'success');
		} catch (error) {
			console.error('Error updating profile:', error);
			showToast('บันทึกไม่สำเร็จ', 'error');
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>โปรไฟล์ | PLEARN</title>
</svelte:head>

<div class="profile-page">
	{#if !user}
		<div class="loading-state">กรุณาเข้าสู่ระบบ...</div>
	{:else}
		<!-- Profile Header Area -->
		<div class="classic-card profile-header">
			<div class="cover-photo"></div>
			<div class="profile-info-container">
				<div class="avatar-container">
					{#if userInfo?.photoURL}
						<img src={userInfo?.photoURL} alt="" class="p-avatar" referrerpolicy="no-referrer" />
					{:else}
						<div class="p-avatar-placeholder">{(userInfo?.displayName || 'U').charAt(0)}</div>
					{/if}
					{#if isProfileOnline}
						<span class="profile-online-dot"></span>
					{/if}
				</div>
				
				<div class="profile-details">
					<div class="name-edit-area">
						{#if isEditing}
							<div class="edit-form">
								<input type="text" bind:value={editName} class="classic-input" placeholder="ชื่อที่แสดง" maxlength="50" />
								<div class="edit-actions">
									<button class="classic-btn btn-secondary" onclick={toggleEdit} disabled={isSaving}>ยกเลิก</button>
									<button class="classic-btn btn-primary" onclick={saveProfile} disabled={isSaving || !editName.trim()}>
										{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
									</button>
								</div>
							</div>
						{:else}
							<h1 class="p-name">
								{userInfo?.displayName || 'ผู้ใช้นิรนาม'}
								{#if userInfo?.role === 'admin'}
									<span class="badge-admin">✅</span>
								{/if}
							</h1>
							<button class="classic-btn btn-secondary edit-btn" onclick={toggleEdit}>
								✏️ แก้ไขโปรไฟล์
							</button>
						{/if}
					</div>
					<p class="p-email">{userInfo?.email}</p>
				</div>
			</div>
			
			<div class="profile-tabs border-t border-t-[var(--color-border-light)] mt-4">
				<div class="tab active">โพสต์ของฉัน</div>
			</div>
		</div>

		<!-- User Posts Feed -->
		<div class="user-feed">
			<h2 class="feed-title">โพสต์ทั้งหมด ({myPosts.length})</h2>
			{#if isLoadingPosts}
				<div class="loading-state">กำลังโหลดผลงาน...</div>
			{:else if myPosts.length === 0}
				<div class="classic-card empty-state">
					<span class="empty-icon">📝</span>
					<h3 class="empty-text">คุณยังไม่มีโพสต์</h3>
					<p class="empty-sub">ลองสร้างเรื่องราวแรกในฟีดหลักสิ!</p>
				</div>
			{:else}
				<div class="feed-grid">
					{#each myPosts as post (post.id)}
						<PostCard {post} />
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.profile-page { max-width: 680px; width: 100%; margin: 0 auto; padding-top: 16px; padding-bottom: 32px; }

	.profile-header { overflow: hidden; margin-bottom: 16px; }

	.cover-photo {
		height: 180px; width: 100%;
		background: linear-gradient(135deg, #E65100, #FF8A65);
	}
	.dark .cover-photo { background: linear-gradient(135deg, #1a1a2e, #16213e); }

	.profile-info-container {
		padding: 0 24px;
		display: flex; flex-direction: column;
		position: relative;
	}

	.avatar-container { margin-top: -56px; margin-bottom: 16px; position: relative; display: inline-block; }
	.profile-online-dot {
		position: absolute; bottom: 8px; right: 4px;
		width: 16px; height: 16px; border-radius: 50%;
		background: var(--color-success); border: 3px solid var(--color-bg-card);
	}

	.p-avatar, .p-avatar-placeholder {
		width: 112px; height: 112px;
		border-radius: 50%; border: 5px solid var(--color-bg-card);
		background-color: var(--color-bg-card);
		box-shadow: 0 2px 12px rgba(0,0,0,0.12);
	}
	.p-avatar-placeholder {
		display: flex; align-items: center; justify-content: center;
		font-size: 40px; font-weight: 700; background-color: var(--color-primary); color: white;
	}

	.profile-details { margin-bottom: 16px; }

	.name-edit-area {
		display: flex; justify-content: space-between; align-items: flex-start;
		margin-bottom: 4px; flex-wrap: wrap; gap: 12px;
	}

	.p-name { font-size: 24px; font-weight: 800; line-height: 1.2; display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em; }
	.badge-admin { font-size: 14px; }
	.p-email { font-size: 14px; color: var(--color-text-muted); }

	.edit-form { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-bottom: 8px; }
	.classic-input {
		width: 100%; max-width: 400px; padding: 10px 16px; border-radius: var(--radius-md);
		border: 1.5px solid var(--color-border); background: var(--color-bg-input); color: var(--color-text);
		font-size: 15px; transition: border-color 0.15s;
	}
	.classic-input:focus { outline: none; border-color: var(--color-primary); }
	.edit-actions { display: flex; gap: 8px; }

	.profile-tabs { display: flex; padding: 0 16px; border-top: 1px solid var(--color-border-light); margin-top: 16px; }
	.tab {
		padding: 12px 20px; font-weight: 600; color: var(--color-primary);
		border-bottom: 2px solid var(--color-primary); font-size: 14px;
	}

	.user-feed { padding-top: 16px; }
	.feed-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; padding: 0 8px; }
	.feed-grid { display: flex; flex-direction: column; gap: 12px; }

	.empty-state { padding: 48px 16px; text-align: center; display: flex; flex-direction: column; align-items: center; }
	.empty-icon { font-size: 32px; margin-bottom: 12px; opacity: 0.4; }
	.empty-text { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
	.empty-sub { color: var(--color-text-muted); font-size: 14px; }

	.loading-state { text-align: center; padding: 32px; color: var(--color-text-muted); font-size: 14px; }

	@media (max-width: 640px) {
		.name-edit-area { flex-direction: column; }
		.edit-btn { width: 100%; }
		.cover-photo { height: 140px; }
		.p-avatar, .p-avatar-placeholder { width: 96px; height: 96px; margin-top: -48px; }
	}
</style>
