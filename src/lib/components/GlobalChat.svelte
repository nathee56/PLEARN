<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, getDocs, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
	import { getRelativeTime } from '$lib/utils/time';
	import { currentUser, userData } from '$lib/stores/auth';

	let messages = $state([]);
	let newMessage = $state('');
	let isSubmitting = $state(false);
	let chatBox = $state(null);

	let user = $state(null);
	let userInfo = $state(null);
	
	const unsubUser = currentUser.subscribe(v => user = v);
	const unsubUserData = userData.subscribe(v => userInfo = v);
	let unsubChat;
	let isResetting = $state(false);

	async function clearGlobalChat() {
		if (isResetting || !user || userInfo?.role !== 'admin') return;
		if (!confirm('ยืนยันการลบข้อความแชททั้งหมดถาวร?')) return;
		
		isResetting = true;
		try {
			const snap = await getDocs(collection(db, 'global_chat'));
			const batch = writeBatch(db);
			snap.forEach(d => batch.delete(d.ref));
			await batch.commit();
			await setDoc(doc(db, 'metadata', 'global_chat'), { lastReset: Date.now() });
			console.log("Chat cleared successfully.");
		} catch (err) {
			console.error("Failed to clear chat:", err);
		} finally {
			isResetting = false;
		}
	}

	async function checkAutoReset() {
		try {
			const metaRef = doc(db, 'metadata', 'global_chat');
			const metaSnap = await getDoc(metaRef);
			const now = Date.now();
			const FIVE_HOURS = 5 * 60 * 60 * 1000;
			
			if (metaSnap.exists()) {
				const lastReset = metaSnap.data().lastReset || 0;
				if (now - lastReset > FIVE_HOURS) {
					if (userInfo?.role === 'admin') {
						await clearGlobalChatSilently();
					}
				}
			} else {
				await setDoc(metaRef, { lastReset: now });
			}
		} catch (err) {
			console.error("Auto-reset check failed:", err);
		}
	}

	async function clearGlobalChatSilently() {
		const snap = await getDocs(collection(db, 'global_chat'));
		const batch = writeBatch(db);
		snap.forEach(d => batch.delete(d.ref));
		await batch.commit();
		await setDoc(doc(db, 'metadata', 'global_chat'), { lastReset: Date.now() });
	}

	onMount(() => {
		checkAutoReset();
		const q = query(
			collection(db, 'global_chat'),
			orderBy('createdAt', 'desc'),
			limit(50)
		);

		unsubChat = onSnapshot(q, (snapshot) => {
			let msgs = [];
			snapshot.forEach(doc => {
				msgs.push({ id: doc.id, ...doc.data() });
			});
			messages = msgs.reverse(); // Reverse so newest is at the bottom
			setTimeout(scrollToBottom, 50);
		});
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
		if (unsubChat) unsubChat();
	});

	function scrollToBottom() {
		if (chatBox) {
			chatBox.scrollTop = chatBox.scrollHeight;
		}
	}

	async function sendMessage(e) {
		e.preventDefault();
		if (!newMessage.trim() || isSubmitting || !user) return;
		
		isSubmitting = true;
		const text = newMessage.trim();
		newMessage = ''; // Optimistic clear

		try {
			await addDoc(collection(db, 'global_chat'), {
				text: text,
				authorUid: user.uid,
				authorName: userInfo?.displayName || user.displayName || 'สมาชิก',
				authorPhoto: userInfo?.photoURL || user.photoURL || '',
				authorRole: userInfo?.role || 'user',
				createdAt: serverTimestamp()
			});
		} catch (error) {
			console.error("Error sending chat:", error);
			newMessage = text; // Restore on fail
		} finally {
			isSubmitting = false;
			setTimeout(scrollToBottom, 50);
		}
	}
</script>

<div class="chat-container classic-card">
	<div class="chat-header">
		แชทสด (Global)
		<span class="pulse-dot"></span>
		
		{#if userInfo?.role === 'admin'}
			<button class="admin-clear-btn" onclick={clearGlobalChat} disabled={isResetting} title="ล้างแชททั้งหมด">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
			</button>
		{/if}
	</div>
	
	<div class="chat-messages" bind:this={chatBox}>
		{#if messages.length === 0}
			<div class="empty-chat">ยังไม่มีข้อความ เริ่มคุยกันเลย!</div>
		{:else}
			{#each messages as msg (msg.id)}
				<div class="chat-msg" class:my-msg={user && msg.authorUid === user.uid}>
					{#if !user || msg.authorUid !== user.uid}
						<div class="chat-avatar-wrap">
							{#if msg.authorPhoto}
								<img src={msg.authorPhoto} alt="" class="chat-avatar" referrerpolicy="no-referrer" />
							{:else}
								<div class="chat-avatar placeholder">{(msg.authorName || 'U').charAt(0)}</div>
							{/if}
						</div>
					{/if}
					
					<div class="chat-content">
						{#if !user || msg.authorUid !== user.uid}
							<div class="chat-name">
								{msg.authorName}
								{#if msg.authorRole === 'admin'}
									<span class="badge-verified" title="PLEARN Verified">
										<svg viewBox="0 0 24 24" fill="#0866FF" width="10" height="10"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/><circle cx="12" cy="12" r="10"/><path d="M10.1 16.7l-4.1-4.1 1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/></svg>
									</span>
								{/if}
							</div>
						{/if}
						<div class="chat-bubble">
							{msg.text}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	{#if user}
		<form class="chat-input-area" onsubmit={sendMessage}>
			<input 
				type="text" 
				class="chat-input" 
				placeholder="พิมพ์ข้อความ..." 
				bind:value={newMessage}
				disabled={isSubmitting}
			/>
			<button type="submit" class="chat-send" disabled={!newMessage.trim() || isSubmitting}>
				ส่ง
			</button>
		</form>
	{:else}
		<div class="chat-input-area locked">
			<a href="/" class="login-prompt">เข้าสู่ระบบเพื่อคุยแชท</a>
		</div>
	{/if}
</div>

<style>
	.chat-container { display: flex; flex-direction: column; height: calc(100vh - 120px); max-height: 800px; overflow: hidden; background: var(--color-bg-card); position: sticky; top: 52px; border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }

	.chat-header {
		padding: 16px; border-bottom: 1px solid var(--color-border-light);
		font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;
		background: var(--color-bg-card); z-index: 2;
	}
	.pulse-dot { width: 8px; height: 8px; background-color: var(--color-success); border-radius: 50%; box-shadow: 0 0 0 rgba(52, 199, 89, 0.4); animation: pulse 2s infinite; margin-right: auto; }

	.admin-clear-btn {
		background: none; border: none; color: var(--color-text-muted); cursor: pointer;
		padding: 4px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
		transition: all 0.12s var(--ease-out);
	}
	.admin-clear-btn:hover { background: rgba(255, 59, 48, 0.08); color: var(--color-danger); }
	.admin-clear-btn:disabled { opacity: 0.5; cursor: wait; }
	@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(52, 199, 89, 0); } 100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); } }

	.chat-messages {
		flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px;
		background: var(--color-bg);
	}
	.empty-chat { text-align: center; color: var(--color-text-muted); font-size: 13px; margin-top: 32px; }

	.chat-msg { display: flex; gap: 8px; align-items: flex-end; }
	.chat-msg.my-msg { flex-direction: row-reverse; }

	.chat-avatar-wrap { flex-shrink: 0; }
	.chat-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
	.chat-avatar.placeholder { background: var(--color-bg-input); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; }

	.chat-content { max-width: 80%; display: flex; flex-direction: column; gap: 2px; }
	.chat-msg.my-msg .chat-content { align-items: flex-end; }

	.chat-name { font-size: 11px; font-weight: 600; color: var(--color-text-muted); margin-left: 4px; display: flex; align-items: center; gap: 2px; }

	.chat-bubble {
		background: var(--color-bg-card); border: 1px solid var(--color-border-light);
		padding: 8px 12px; border-radius: 16px; border-bottom-left-radius: 4px;
		font-size: 14px; line-height: 1.4; word-break: break-word; font-family: var(--font-thai);
	}
	.chat-msg.my-msg .chat-bubble {
		background: var(--color-primary); color: white; border-color: var(--color-primary);
		border-bottom-left-radius: 16px; border-bottom-right-radius: 4px;
	}

	.chat-input-area {
		padding: 12px; border-top: 1px solid var(--color-border-light);
		display: flex; gap: 8px; background: var(--color-bg-card);
	}
	.chat-input-area.locked { justify-content: center; padding: 16px; }
	.login-prompt { color: var(--color-primary); font-weight: 600; font-size: 14px; text-decoration: none; }

	.chat-input {
		flex: 1; border: 1.5px solid var(--color-border); border-radius: var(--radius-full);
		padding: 8px 16px; font-size: 14px; background: var(--color-bg-input); color: var(--color-text); outline: none;
		transition: border-color 0.15s;
	}
	.chat-input:focus { border-color: var(--color-primary); }

	.chat-send {
		background: none; border: none; color: var(--color-primary); font-weight: 700;
		padding: 0 8px; cursor: pointer; font-size: 14px;
		transition: opacity 0.12s;
	}
	.chat-send:disabled { color: var(--color-text-muted); cursor: not-allowed; }
</style>
