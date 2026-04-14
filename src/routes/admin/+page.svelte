<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { currentUser, userData } from '$lib/stores/auth';
	import {
		collection, query, where, orderBy, getDocs, limit,
		getCountFromServer, Timestamp
	} from 'firebase/firestore';

	let user = $state(null);
	let userInfo = $state(null);
	let isLoading = $state(true);

	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => {
		userInfo = v;
		// Once we know the user's role, load if admin
		if (v && v.role === 'admin') {
			loadAnalytics();
		} else if (v) {
			isLoading = false;
		}
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
	});

	// Stats
	let totalPosts = $state(0);
	let totalUsers = $state(0);
	let onlineUsersCount = $state(0);
	let postsToday = $state(0);

	// Charts data
	let postsPerDay = $state([]);
	let topPosts = $state([]);
	let activeUsers = $state([]);

	// Date helpers
	function startOfDay(date) {
		const d = new Date(date);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	function formatDayLabel(date) {
		const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
		const d = new Date(date);
		return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
	}

	async function loadAnalytics() {
		isLoading = true;
		try {
			await Promise.all([
				fetchOverviewStats(),
				fetchPostsPerDay(),
				fetchTopPosts(),
				fetchActiveUsers()
			]);
		} catch (e) {
			console.error('Analytics error:', e);
		} finally {
			isLoading = false;
		}
	}

	async function fetchOverviewStats() {
		// Total posts
		const postsSnap = await getCountFromServer(collection(db, 'posts'));
		totalPosts = postsSnap.data().count;

		// Total users
		const usersSnap = await getCountFromServer(collection(db, 'users'));
		totalUsers = usersSnap.data().count;

		// Online users (active in last 5 mins)
		const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
		const qOnline = query(collection(db, 'users'), where('lastActive', '>=', fiveMinsAgo));
		const onlineSnap = await getCountFromServer(qOnline);
		onlineUsersCount = onlineSnap.data().count;

		// Posts today
		const todayStart = startOfDay(new Date());
		const qToday = query(
			collection(db, 'posts'),
			where('createdAt', '>=', Timestamp.fromDate(todayStart))
		);
		const todaySnap = await getCountFromServer(qToday);
		postsToday = todaySnap.data().count;
	}

	async function fetchPostsPerDay() {
		const days = [];
		const now = new Date();

		for (let i = 6; i >= 0; i--) {
			const dayStart = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
			const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

			const q = query(
				collection(db, 'posts'),
				where('createdAt', '>=', Timestamp.fromDate(dayStart)),
				where('createdAt', '<', Timestamp.fromDate(dayEnd))
			);

			const snap = await getCountFromServer(q);
			days.push({
				label: formatDayLabel(dayStart),
				count: snap.data().count,
				isToday: i === 0
			});
		}

		postsPerDay = days;
	}

	async function fetchTopPosts() {
		// Get recent posts and calculate total reactions client-side
		const q = query(
			collection(db, 'posts'),
			orderBy('createdAt', 'desc'),
			limit(50)
		);

		const snap = await getDocs(q);
		const posts = snap.docs.map((d) => {
			const data = d.data();
			const totalReactions =
				(data.reactions?.plearn || 0) +
				(data.reactions?.insight || 0) +
				(data.reactions?.thanks || 0);
			return {
				id: d.id,
				title: data.title || (data.content ? data.content.substring(0, 80) + '...' : 'โพสต์'),
				authorName: data.isAnonymous ? 'สมาชิกนิรนาม' : (data.authorName || 'ไม่ระบุ'),
				totalReactions,
				commentCount: data.commentCount || 0,
				type: data.type || 'general',
				createdAt: data.createdAt
			};
		});

		// Sort by total reactions and take top 5
		posts.sort((a, b) => b.totalReactions - a.totalReactions);
		topPosts = posts.slice(0, 5);
	}

	async function fetchActiveUsers() {
		const q = query(
			collection(db, 'users'),
			orderBy('lastActive', 'desc'),
			limit(10)
		);

		const snap = await getDocs(q);
		activeUsers = snap.docs.map((d) => {
			const data = d.data();
			const lastActive = data.lastActive?.toDate?.() || new Date();
			const diffMs = Date.now() - lastActive.getTime();
			const diffMins = Math.floor(diffMs / 60000);

			let statusText;
			if (diffMins < 5) statusText = 'ออนไลน์';
			else if (diffMins < 60) statusText = `${diffMins} นาทีก่อน`;
			else if (diffMins < 1440) statusText = `${Math.floor(diffMins / 60)} ชม.ก่อน`;
			else statusText = `${Math.floor(diffMins / 1440)} วันก่อน`;

			return {
				id: d.id,
				displayName: data.displayName || 'ไม่ระบุ',
				photoURL: data.photoURL || '',
				role: data.role || 'user',
				isOnline: diffMins < 5,
				statusText
			};
		});
	}

	// Chart helpers
	let maxPostCount = $derived(Math.max(...postsPerDay.map(d => d.count), 1));

	function getBarHeight(count) {
		return Math.max((count / maxPostCount) * 100, 4);
	}

	function getRelativeTimeShort(ts) {
		if (!ts) return '';
		const date = ts.toDate ? ts.toDate() : new Date(ts);
		const diffMs = Date.now() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 60) return `${diffMins}น.`;
		if (diffMins < 1440) return `${Math.floor(diffMins / 60)}ชม.`;
		return `${Math.floor(diffMins / 1440)}ว.`;
	}
</script>

<svelte:head>
	<title>Admin Dashboard — PLEARN</title>
</svelte:head>

<div class="admin-page">
	{#if !userInfo}
		<div class="admin-loading">
			<div class="spinner"></div>
		</div>
	{:else if userInfo.role !== 'admin'}
		<div class="access-denied animate-fade-in">
			<div class="denied-icon">🔒</div>
			<h2>ไม่มีสิทธิ์เข้าถึง</h2>
			<p>หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
			<a href="/" class="back-btn">กลับหน้าหลัก</a>
		</div>
	{:else if isLoading}
		<div class="admin-loading">
			<div class="spinner"></div>
			<p>กำลังโหลดข้อมูล Analytics...</p>
		</div>
	{:else}
		<!-- Admin Header -->
		<div class="admin-header animate-fade-in">
			<div class="admin-title-row">
				<h1 class="admin-title">📊 Admin Dashboard</h1>
				<button class="refresh-btn" onclick={() => loadAnalytics()}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
					รีเฟรช
				</button>
			</div>
			<p class="admin-subtitle">ข้อมูลรวมของ PLEARN — อัปเดตล่าสุด</p>
		</div>

		<!-- Overview Stats Cards -->
		<div class="stats-grid animate-slide-up">
			<div class="stat-card">
				<div class="stat-icon ic-posts">📝</div>
				<div class="stat-info">
					<div class="stat-number">{totalPosts}</div>
					<div class="stat-label">โพสต์ทั้งหมด</div>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon ic-users">👥</div>
				<div class="stat-info">
					<div class="stat-number">{totalUsers}</div>
					<div class="stat-label">สมาชิกทั้งหมด</div>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon ic-online">🟢</div>
				<div class="stat-info">
					<div class="stat-number">{onlineUsersCount}</div>
					<div class="stat-label">ออนไลน์ขณะนี้</div>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon ic-today">🔥</div>
				<div class="stat-info">
					<div class="stat-number">{postsToday}</div>
					<div class="stat-label">โพสต์วันนี้</div>
				</div>
			</div>
		</div>

		<!-- Two column layout -->
		<div class="analytics-grid">
			<!-- Posts per Day Chart -->
			<div class="analytics-card chart-card animate-slide-up">
				<h2 class="card-title">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
					โพสต์ต่อวัน (7 วันย้อนหลัง)
				</h2>
				<div class="bar-chart">
					{#each postsPerDay as day}
						<div class="bar-col" class:today={day.isToday}>
							<div class="bar-count">{day.count}</div>
							<div class="bar-fill" style="height: {getBarHeight(day.count)}%">
								<div class="bar-inner"></div>
							</div>
							<div class="bar-label">{day.label}</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Most Reacted Posts -->
			<div class="analytics-card animate-slide-up">
				<h2 class="card-title">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
					โพสต์ที่ได้รับ Reactions มากที่สุด
				</h2>
				<div class="top-posts-list">
					{#each topPosts as post, i}
						<a href="/post/{post.id}" class="top-post-item">
							<div class="tp-rank" class:gold={i === 0} class:silver={i === 1} class:bronze={i === 2}>
								{i + 1}
							</div>
							<div class="tp-info">
								<div class="tp-title">{post.title}</div>
								<div class="tp-meta">
									<span class="tp-author">{post.authorName}</span>
									<span class="tp-time">{getRelativeTimeShort(post.createdAt)}</span>
								</div>
							</div>
							<div class="tp-stats">
								<div class="tp-reactions">
									<span class="tp-reactions-icon">❤️</span>
									{post.totalReactions}
								</div>
								<div class="tp-comments">
									<span class="tp-comments-icon">💬</span>
									{post.commentCount}
								</div>
							</div>
						</a>
					{:else}
						<div class="no-data">ยังไม่มีข้อมูลโพสต์</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Active Users -->
		<div class="analytics-card active-users-card animate-slide-up">
			<h2 class="card-title">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
				ผู้ใช้ที่ Active ล่าสุด
			</h2>
			<div class="active-users-grid">
				{#each activeUsers as aUser}
					<a href="/profile?uid={aUser.id}" class="au-item">
						<div class="au-avatar-wrap">
							{#if aUser.photoURL}
								<img src={aUser.photoURL} alt="" class="au-avatar" referrerpolicy="no-referrer" />
							{:else}
								<div class="au-avatar-placeholder">{(aUser.displayName || 'U').charAt(0)}</div>
							{/if}
							{#if aUser.isOnline}
								<span class="au-online-dot"></span>
							{/if}
						</div>
						<div class="au-info">
							<div class="au-name">
								{aUser.displayName}
								{#if aUser.role === 'admin'}
									<span class="au-admin-badge">Admin</span>
								{/if}
							</div>
							<div class="au-status" class:online={aUser.isOnline}>
								{aUser.statusText}
							</div>
						</div>
					</a>
				{:else}
					<div class="no-data">ไม่พบข้อมูลผู้ใช้</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-page {
		max-width: 900px; width: 100%; margin: 0 auto; padding: 8px;
	}

	/* Loading & Auth */
	.admin-loading {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		min-height: 40vh; gap: 16px; color: var(--color-text-muted);
	}
	.spinner { width: 32px; height: 32px; border: 2.5px solid var(--color-border-light); border-top-color: var(--color-primary); border-radius: 50%; animation: spin .7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.access-denied {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		min-height: 50vh; gap: 12px; text-align: center;
	}
	.denied-icon { font-size: 48px; opacity: 0.4; }
	.access-denied h2 { font-size: 20px; font-weight: 700; }
	.access-denied p { color: var(--color-text-muted); font-size: 14px; }
	.back-btn {
		margin-top: 16px; padding: 10px 24px; background: var(--color-primary);
		color: white; border-radius: var(--radius-full); text-decoration: none; font-weight: 600; font-size: 14px;
		transition: all 0.15s var(--ease-out);
	}
	.back-btn:hover { background: var(--color-primary-hover); transform: translateY(-1px); }

	/* Header */
	.admin-header { margin-bottom: 24px; }
	.admin-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	.admin-title { font-size: 24px; font-weight: 800; display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em; }
	.admin-subtitle { color: var(--color-text-muted); font-size: 14px; margin-top: 4px; }

	.refresh-btn {
		display: flex; align-items: center; gap: 6px;
		padding: 8px 16px; border-radius: var(--radius-full); border: 1px solid var(--color-border-light);
		background: var(--color-bg-card); color: var(--color-text-muted);
		font-weight: 600; font-size: 13px; cursor: pointer;
		transition: all 0.15s var(--ease-out); box-shadow: var(--shadow-card);
	}
	.refresh-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-soft); }

	/* Stats Grid */
	.stats-grid {
		display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;
	}
	.stat-card {
		background: var(--color-bg-card); border-radius: var(--radius-lg); padding: 16px;
		display: flex; align-items: center; gap: 12px;
		box-shadow: var(--shadow-card);
		transition: all 0.2s var(--ease-out);
	}
	.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-elevated); }

	.stat-icon { font-size: 24px; flex-shrink: 0; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); }
	.ic-posts { background: rgba(59, 130, 246, 0.08); }
	.ic-users { background: rgba(168, 85, 247, 0.08); }
	.ic-online { background: rgba(52, 199, 89, 0.08); }
	.ic-today { background: var(--color-primary-soft); }

	.stat-number { font-size: 24px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
	.stat-label { font-size: 12px; color: var(--color-text-muted); font-weight: 600; margin-top: 2px; }

	/* Analytics Grid */
	.analytics-grid {
		display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;
	}

	.analytics-card {
		background: var(--color-bg-card); border-radius: var(--radius-lg); padding: 20px;
		box-shadow: var(--shadow-card);
	}

	.card-title {
		font-size: 15px; font-weight: 700; margin-bottom: 16px;
		display: flex; align-items: center; gap: 8px;
		color: var(--color-text);
	}

	/* Bar Chart */
	.bar-chart {
		display: flex; align-items: flex-end; justify-content: space-between;
		gap: 8px; height: 180px; padding-top: 12px;
	}
	.bar-col {
		display: flex; flex-direction: column; align-items: center; flex: 1;
		gap: 6px; height: 100%; justify-content: flex-end;
	}
	.bar-count {
		font-size: 12px; font-weight: 700; color: var(--color-text-muted);
	}
	.bar-fill {
		width: 100%; max-width: 40px; border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-xs);
		overflow: hidden; min-height: 6px;
		transition: height 0.8s var(--ease-spring);
	}
	.bar-inner {
		width: 100%; height: 100%;
		background: linear-gradient(180deg, var(--color-primary) 0%, rgba(230, 81, 0, 0.5) 100%);
		border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-xs);
	}
	.bar-col.today .bar-inner {
		background: linear-gradient(180deg, #FF8A65 0%, var(--color-primary) 100%);
		box-shadow: 0 4px 12px var(--color-primary-soft);
	}
	.bar-col.today .bar-count { color: var(--color-primary); font-weight: 800; }
	.bar-label {
		font-size: 11px; color: var(--color-text-muted); font-weight: 600;
		white-space: nowrap;
	}

	/* Top Posts */
	.top-posts-list { display: flex; flex-direction: column; gap: 4px; }
	.top-post-item {
		display: flex; align-items: center; gap: 10px;
		padding: 10px 12px; border-radius: var(--radius-md);
		text-decoration: none; color: var(--color-text);
		transition: background 0.12s var(--ease-out);
	}
	.top-post-item:hover { background: var(--color-bg-hover); }

	.tp-rank {
		width: 28px; height: 28px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-weight: 700; font-size: 12px; flex-shrink: 0;
		background: var(--color-bg-input); color: var(--color-text-muted);
	}
	.tp-rank.gold { background: linear-gradient(135deg, #FFD700, #FFA000); color: white; box-shadow: 0 2px 8px rgba(255, 215, 0, 0.25); }
	.tp-rank.silver { background: linear-gradient(135deg, #C0C0C0, #9E9E9E); color: white; }
	.tp-rank.bronze { background: linear-gradient(135deg, #CD7F32, #A0522D); color: white; }

	.tp-info { flex: 1; min-width: 0; }
	.tp-title { font-weight: 600; font-size: 13px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.tp-meta { display: flex; gap: 8px; margin-top: 2px; }
	.tp-author { font-size: 11px; color: var(--color-text-muted); }
	.tp-time { font-size: 11px; color: var(--color-text-muted); }

	.tp-stats { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; flex-shrink: 0; }
	.tp-reactions, .tp-comments { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
	.tp-reactions-icon, .tp-comments-icon { font-size: 11px; }

	/* Active Users */
	.active-users-card { margin-bottom: 24px; }
	.active-users-grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;
	}
	.au-item {
		display: flex; align-items: center; gap: 10px;
		padding: 10px 12px; border-radius: var(--radius-md);
		text-decoration: none; color: var(--color-text);
		transition: all 0.12s var(--ease-out);
	}
	.au-item:hover { background: var(--color-bg-hover); }

	.au-avatar-wrap { position: relative; flex-shrink: 0; }
	.au-avatar, .au-avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
	.au-avatar-placeholder {
		background: var(--color-primary); color: white;
		display: flex; align-items: center; justify-content: center;
		font-weight: 600; font-size: 14px;
	}
	.au-online-dot {
		position: absolute; bottom: 0; right: 0;
		width: 10px; height: 10px; border-radius: 50%;
		background: var(--color-success); border: 2px solid var(--color-bg-card);
	}

	.au-info { flex: 1; min-width: 0; }
	.au-name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
	.au-admin-badge {
		font-size: 10px; padding: 1px 6px; border-radius: var(--radius-full);
		background: var(--color-primary); color: white; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.05em;
	}
	.au-status { font-size: 12px; color: var(--color-text-muted); }
	.au-status.online { color: var(--color-success); font-weight: 600; }

	.no-data {
		padding: 32px; text-align: center; color: var(--color-text-muted);
		font-size: 14px; grid-column: 1 / -1;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.stats-grid { grid-template-columns: repeat(2, 1fr); }
		.analytics-grid { grid-template-columns: 1fr; }
		.admin-title { font-size: 20px; }
	}

	@media (max-width: 480px) {
		.admin-page { padding: 4px; }
		.stat-card { padding: 12px; }
		.stat-icon { width: 36px; height: 36px; font-size: 20px; }
		.stat-number { font-size: 20px; }
		.active-users-grid { grid-template-columns: 1fr; }
	}

	/* Dark mode adjustments */
	:global(.dark) .stat-card { border-color: transparent; }
	:global(.dark) .analytics-card { border-color: transparent; }
</style>
