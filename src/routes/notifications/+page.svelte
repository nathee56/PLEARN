<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
	import { getRelativeTime } from '$lib/utils/time';
	import { currentUser } from '$lib/stores/auth';
	import { showToast } from '$lib/stores/toast';

	let user = $state(null);
	let notifications = $state([]);
	let isLoading = $state(true);
	let unsub = null;
	const unsubUser = currentUser.subscribe(v => user = v);

	onMount(() => {
		if (user) {
			const q = query(
				collection(db, 'notifications'),
				where('forUid', '==', user.uid),
				orderBy('createdAt', 'desc'),
				limit(50)
			);

			unsub = onSnapshot(q, (snapshot) => {
				let notifs = [];
				snapshot.forEach((doc) => {
					notifs.push({ id: doc.id, ...doc.data() });
				});
				notifications = notifs;
				isLoading = false;
			});
		} else {
			isLoading = false;
		}
	});

	onDestroy(() => {
		unsubUser();
		if (unsub) unsub();
	});

	function getNotifIcon(type) {
		switch (type) {
			case 'like': return 'heart';
			case 'comment': return 'comment';
			case 'reply': return 'reply';
			default: return 'bell';
		}
	}

	function getNotifText(notif) {
		const name = notif.fromName || 'สมาชิก';
		switch (notif.type) {
			case 'like': return { name, action: 'ถูกใจโพสต์ของคุณ', preview: '' };
			case 'comment': return { name, action: 'แสดงความคิดเห็นในโพสต์ของคุณ', preview: notif.commentPreview || '' };
			case 'reply': return { name, action: 'ตอบกลับความคิดเห็นของคุณ', preview: notif.commentPreview || '' };
			default: return { name, action: 'ทำกิจกรรมในโพสต์ของคุณ', preview: '' };
		}
	}

	async function markAsRead(notifId, currentStatus) {
		if (currentStatus) return; // already read
		try {
			await updateDoc(doc(db, 'notifications', notifId), { isRead: true });
		} catch (e) {
			console.error("Error marking read:", e);
		}
	}

	async function markAllAsRead() {
		const unreadNotifs = notifications.filter(n => !n.isRead);
		if (unreadNotifs.length === 0) {
			showToast('ไม่มีการแจ้งเตือนใหม่', 'success');
			return;
		}

		try {
			const batch = writeBatch(db);
			unreadNotifs.forEach(notif => {
				batch.update(doc(db, 'notifications', notif.id), { isRead: true });
			});
			await batch.commit();
			showToast('อ่านทั้งหมดแล้ว ✅', 'success');
		} catch (e) {
			console.error("Error marking all read:", e);
			showToast('เกิดข้อผิดพลาด', 'error');
		}
	}
</script>

<svelte:head>
	<title>การแจ้งเตือน | PLEARN</title>
</svelte:head>

<div class="notifications-page">
	<div class="page-header">
		<h1 class="page-title">การแจ้งเตือน</h1>
		<button class="classic-btn btn-secondary" onclick={markAllAsRead}>อ่านทั้งหมด</button>
	</div>

	{#if isLoading}
		<!-- Loading Skeleton -->
		{#each Array(5) as _}
			<div class="classic-card skel-wrapper">
				<div class="skel-head">
					<div class="skel-circle"></div>
					<div class="skel-lines"><div class="skel-l w-90"></div><div class="skel-l w-40"></div></div>
				</div>
			</div>
		{/each}
	{:else if !user}
		<div class="classic-card empty-state">กรุณาเข้าสู่ระบบเพื่อดูการแจ้งเตือน</div>
	{:else if notifications.length === 0}
		<div class="classic-card empty-state">
			<span class="empty-icon">🔔</span>
			<h3>ไม่มีการแจ้งเตือน</h3>
			<p>คุณยังไม่มีรายการแจ้งเตือนใหม่ในขณะนี้</p>
		</div>
	{:else}
		<div class="notif-list classic-card">
			{#each notifications as notif (notif.id)}
				{@const info = getNotifText(notif)}
				<a 
					href={notif.postId ? `/post/${notif.postId}` : '#'} 
					class="notif-item {notif.isRead ? '' : 'unread'}"
					onclick={(e) => {
						if (!notif.postId) e.preventDefault();
						markAsRead(notif.id, notif.isRead);
					}}
				>
					<div class="n-icon icon-{getNotifIcon(notif.type)}">
						{#if notif.type === 'like'}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
						{:else if notif.type === 'comment'}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
						{:else if notif.type === 'reply'}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
						{:else}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
						{/if}
					</div>
					<div class="n-content">
						<div class="n-text">
							<strong>{info.name}</strong> {info.action}
						</div>
						{#if info.preview}
							<div class="n-preview">"{info.preview}"</div>
						{/if}
						<div class="n-time">{getRelativeTime(notif.createdAt)}</div>
					</div>
					{#if !notif.isRead}
						<div class="n-dot"></div>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.notifications-page {
		max-width: 600px; margin: 0 auto; padding-bottom: 40px;
	}
	.page-header {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: 24px; margin-top: 16px; padding: 0 12px;
	}
	.page-title {
		font-size: 24px; font-weight: 700; color: var(--color-text); margin: 0;
	}

	.empty-state {
		text-align: center; padding: 60px 20px; color: var(--color-text-muted);
		display: flex; flex-direction: column; align-items: center; gap: 8px;
	}
	.empty-icon { font-size: 40px; }

	.notif-list { display: flex; flex-direction: column; overflow: hidden; }

	.notif-item {
		display: flex; align-items: center; padding: 16px 20px;
		text-decoration: none; border-bottom: 1px solid var(--color-border-light);
		transition: background 0.15s; gap: 16px;
	}
	.notif-item:last-child { border-bottom: none; }
	.notif-item:hover { background: var(--color-bg-hover); }
	
	.notif-item.unread { background: var(--color-primary-soft); }
	.notif-item.unread:hover { background: rgba(230, 81, 0, 0.08); }

	.n-icon {
		width: 48px; height: 48px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center; flex-shrink: 0;
	}
	.icon-heart { background: rgba(255, 59, 48, 0.08); color: var(--color-danger); }
	.icon-comment { background: rgba(8, 102, 255, 0.08); color: #0866FF; }
	.icon-reply { background: rgba(52, 199, 89, 0.08); color: var(--color-success); }

	.n-content { flex: 1; min-width: 0; }
	.n-text { font-size: 15px; color: var(--color-text); line-height: 1.4; }
	.n-text strong { font-weight: 700; color: var(--color-text); }
	.n-preview {
		font-size: 14px; color: var(--color-text-muted); margin-top: 4px;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		font-style: italic;
	}
	.n-time { font-size: 13px; color: var(--color-primary); font-weight: 600; margin-top: 4px; }

	.n-dot {
		width: 10px; height: 10px; background: var(--color-primary);
		border-radius: 50%; flex-shrink: 0; margin-left: 8px;
	}

	.skel-wrapper { padding: 16px; margin-bottom: 8px; border-radius: var(--radius-md); }
</style>
