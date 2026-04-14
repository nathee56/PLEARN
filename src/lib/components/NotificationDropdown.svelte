<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
	import { getRelativeTime } from '$lib/utils/time';
	import { goto } from '$app/navigation';

	let { user } = $props();

	let notifications = $state([]);
	let unreadCount = $state(0);
	let isOpen = $state(false);
	let unsub = null;

	onMount(() => {
		if (user) {
			const q = query(
				collection(db, 'notifications'),
				where('forUid', '==', user.uid),
				orderBy('createdAt', 'desc'),
				limit(20)
			);

			unsub = onSnapshot(q, (snapshot) => {
				let notifs = [];
				let count = 0;
				snapshot.forEach((doc) => {
					const data = doc.data();
					notifs.push({ id: doc.id, ...data });
					if (!data.isRead) count++;
				});
				notifications = notifs;
				unreadCount = count;
			});
		}
	});

	onDestroy(() => {
		if (unsub) unsub();
	});

	function toggleDropdown() {
		isOpen = !isOpen;
	}

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
			case 'like':
				return { name, action: 'ถูกใจโพสต์ของคุณ', preview: '' };
			case 'comment':
				return { name, action: 'แสดงความคิดเห็นในโพสต์ของคุณ', preview: notif.commentPreview || '' };
			case 'reply':
				return { name, action: 'ตอบกลับความคิดเห็นของคุณ', preview: notif.commentPreview || '' };
			default:
				return { name, action: 'ทำกิจกรรมในโพสต์ของคุณ', preview: '' };
		}
	}

	async function handleNotifClick(notif) {
		// Mark as read
		if (!notif.isRead) {
			try {
				await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
			} catch (e) {
				console.error("Error marking read:", e);
			}
		}
		isOpen = false;
		
		// Navigate to post if postId exists
		if (notif.postId) {
			goto(`/post/${notif.postId}`);
		}
	}

	async function markAllAsRead() {
		const unreadNotifs = notifications.filter(n => !n.isRead);
		if (unreadNotifs.length === 0) return;

		try {
			const batch = writeBatch(db);
			unreadNotifs.forEach(n => {
				batch.update(doc(db, 'notifications', n.id), { isRead: true });
			});
			await batch.commit();
		} catch (e) {
			console.error("Error marking all as read:", e);
		}
	}
</script>

<div class="notif-wrapper">
	<button class="bell-btn" onclick={toggleDropdown}>
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
			<path d="M13.73 21a2 2 0 0 1-3.46 0"/>
		</svg>
		{#if unreadCount > 0}
			<span class="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
		{/if}
	</button>

	{#if isOpen}
		<button class="dropdown-overlay" onclick={toggleDropdown} aria-label="ปิด"></button>
		<div class="dropdown-menu wrapper-anim">
			<div class="dropdown-header">
				<span class="header-title">การแจ้งเตือน</span>
				{#if unreadCount > 0}
					<button class="mark-all-btn" onclick={markAllAsRead}>อ่านทั้งหมด</button>
				{/if}
			</div>
			<div class="dropdown-list">
				{#if notifications.length === 0}
					<div class="empty-state">
						<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3; margin-bottom: 0.5rem;">
							<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
							<path d="M13.73 21a2 2 0 0 1-3.46 0"/>
						</svg>
						<div>ไม่มีการแจ้งเตือนใหม่</div>
					</div>
				{:else}
					{#each notifications as notif}
						{@const info = getNotifText(notif)}
						<button class="notif-item" class:unread={!notif.isRead} onclick={() => handleNotifClick(notif)}>
							<div class="n-icon" class:icon-heart={notif.type === 'like'} class:icon-comment={notif.type === 'comment'} class:icon-reply={notif.type === 'reply'}>
								{#if notif.type === 'like'}
									<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
										<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
									</svg>
								{:else if notif.type === 'comment'}
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
									</svg>
								{:else if notif.type === 'reply'}
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="9 17 4 12 9 7"/>
										<path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
									</svg>
								{:else}
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
									</svg>
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
							{#if notif.postId}
								<div class="n-goto" title="ดูโพสต์">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="9 18 15 12 9 6"/>
									</svg>
								</div>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
			<div class="dropdown-footer">
				<a href="/notifications" class="view-all-link" onclick={() => isOpen=false}>ดูการแจ้งเตือนทั้งหมด</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.notif-wrapper { position: relative; display: flex; align-items: center; }
	.bell-btn {
		background: transparent; border: none; width: 36px; height: 36px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text);
		position: relative; transition: background 0.12s var(--ease-out);
	}
	.bell-btn:hover { background: var(--color-bg-hover); }

	.badge {
		position: absolute; top: 0; right: 0; background: var(--color-danger); color: white;
		font-size: 10px; font-weight: 700; width: 16px; height: 16px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center; border: 2px solid var(--color-nav-bg);
	}

	.dropdown-overlay { position: fixed; inset: 0; z-index: 150; background: transparent; border: none; cursor: default; }
	.dropdown-menu {
		position: absolute; top: 120%; right: 0; width: 360px; background: var(--color-bg-card);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-elevated); z-index: 151;
		overflow: hidden;
	}

	.wrapper-anim { animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1); transform-origin: top right; }
	@keyframes slideDown { from { opacity: 0; transform: scale(0.96) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }

	.dropdown-header {
		padding: 16px 20px; font-weight: 700; font-size: 20px;
		border-bottom: 1px solid var(--color-border-light);
		display: flex; justify-content: space-between; align-items: center;
	}
	.header-title { flex: 1; }
	.mark-all-btn {
		background: none; border: none; color: var(--color-primary); font-size: 13px;
		font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: var(--radius-sm);
		transition: background 0.12s var(--ease-out);
	}
	.mark-all-btn:hover { background: var(--color-primary-soft); }

	.dropdown-list { max-height: 400px; overflow-y: auto; }
	.empty-state { padding: 40px 16px; text-align: center; color: var(--color-text-muted); font-size: 14px; display: flex; flex-direction: column; align-items: center; }

	.notif-item {
		display: flex; align-items: center; width: 100%; text-align: left; padding: 12px 16px;
		background: transparent; border: none; border-bottom: 1px solid var(--color-border-light);
		cursor: pointer; transition: background 0.12s var(--ease-out); gap: 12px;
	}
	.notif-item:last-child { border-bottom: none; }
	.notif-item:hover { background: var(--color-bg-hover); }
	.notif-item.unread { background: var(--color-primary-soft); }
	.notif-item.unread:hover { background: rgba(230, 81, 0, 0.08); }

	.n-icon {
		font-size: 18px; width: 40px; height: 40px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center; flex-shrink: 0;
		transition: transform 0.15s var(--ease-out);
	}
	.notif-item:hover .n-icon { transform: scale(1.05); }
	.icon-heart { background: rgba(255, 59, 48, 0.08); color: var(--color-danger); }
	.icon-comment { background: rgba(8, 102, 255, 0.08); color: #0866FF; }
	.icon-reply { background: rgba(52, 199, 89, 0.08); color: var(--color-success); }

	.n-content { flex: 1; min-width: 0; }
	.n-text { font-size: 14px; color: var(--color-text); line-height: 1.35; }
	.n-text strong { font-weight: 700; }
	.n-preview {
		font-size: 12px; color: var(--color-text-muted);
		margin-top: 2px; white-space: nowrap; overflow: hidden;
		text-overflow: ellipsis; max-width: 200px; font-style: italic;
	}
	.n-time { font-size: 11px; color: var(--color-primary); margin-top: 2px; font-weight: 600; }
	.n-dot { width: 8px; height: 8px; background: var(--color-primary); border-radius: 50%; flex-shrink: 0; }
	.n-goto {
		color: var(--color-text-muted); flex-shrink: 0;
		opacity: 0; transition: opacity 0.15s;
	}
	.notif-item:hover .n-goto { opacity: 1; }

	@media (max-width: 600px) {
		.dropdown-menu { position: fixed; top: 52px; right: 0; left: 0; width: 100%; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
	}

	.dropdown-footer {
		padding: 12px; text-align: center; border-top: 1px solid var(--color-border-light);
	}
	.view-all-link {
		color: var(--color-primary); font-size: 14px; font-weight: 600; text-decoration: none;
		transition: color 0.12s; display: inline-block; padding: 4px 8px; border-radius: var(--radius-sm);
	}
	.view-all-link:hover { background: var(--color-primary-soft); }
</style>
