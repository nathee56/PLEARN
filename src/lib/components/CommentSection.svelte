<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { currentUser, userData } from '$lib/stores/auth';
	import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
	import { getRelativeTime } from '$lib/utils/time';
	import { showToast } from '$lib/stores/toast';

	let { postId, postAuthorUid } = $props();

	let comments = $state([]);
	let newCommentText = $state('');
	let isAnonymous = $state(false);
	let isSubmitting = $state(false);
	let isLoading = $state(true);

	// Reply state
	let replyTo = $state(null); // { id, authorName }

	let user = $state(null);
	let userInfo = $state(null);
	let unsubComments;

	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => (userInfo = v));

	// Derived: threaded comments (parent + replies grouped)
	let threadedComments = $derived.by(() => {
		const parents = comments.filter(c => !c.replyToId);
		return parents.map(parent => ({
			...parent,
			replies: comments.filter(c => c.replyToId === parent.id)
		}));
	});

	onMount(() => {
		const commentsRef = collection(db, 'posts', postId, 'comments');
		const q = query(commentsRef, orderBy('createdAt', 'asc'));

		unsubComments = onSnapshot(q, (snapshot) => {
			comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
			isLoading = false;
		});
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
		if (unsubComments) unsubComments();
	});

	function startReply(comment) {
		replyTo = { id: comment.id, authorName: comment.isAnonymous ? 'สมาชิกนิรนาม' : comment.authorName };
	}

	function cancelReply() {
		replyTo = null;
	}

	async function submitComment() {
		if (!newCommentText.trim() || isSubmitting || !user) return;
		isSubmitting = true;

		try {
			const commentData = {
				text: newCommentText.trim(),
				authorUid: user.uid,
				authorName: userInfo?.displayName || user.displayName || 'ผู้ใช้',
				authorPhoto: userInfo?.photoURL || user.photoURL || '',
				authorRole: userInfo?.role || 'user',
				isAnonymous,
				createdAt: serverTimestamp()
			};

			// If replying, add replyToId
			if (replyTo) {
				commentData.replyToId = replyTo.id;
				commentData.replyToName = replyTo.authorName;
			}

			await addDoc(collection(db, 'posts', postId, 'comments'), commentData);

			await updateDoc(doc(db, 'posts', postId), {
				commentCount: increment(1)
			});

			// Notification — find the target user
			const notifyUid = replyTo
				? comments.find(c => c.id === replyTo.id)?.authorUid
				: postAuthorUid;

			if (notifyUid && notifyUid !== user.uid) {
				await addDoc(collection(db, 'notifications'), {
					forUid: notifyUid,
					fromUid: user.uid,
					fromName: isAnonymous ? 'สมาชิกนิรนาม' : (userInfo?.displayName || user.displayName || 'สมาชิก'),
					type: replyTo ? 'reply' : 'comment',
					postId: postId,
					commentPreview: newCommentText.trim().substring(0, 50),
					isRead: false,
					createdAt: serverTimestamp()
				});
			}

			newCommentText = '';
			isAnonymous = false;
			replyTo = null;
		} catch (error) {
			console.error('Error adding comment:', error);
			showToast('ส่งคอมเมนต์ไม่สำเร็จ', 'error');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="comments-section">
	{#if threadedComments.length > 0}
		<div class="comments-list">
			{#each threadedComments as comment (comment.id)}
				<!-- Parent comment -->
				<div class="cm-item">
					<div class="cm-avatar-wrap">
						{#if comment.isAnonymous}
							<div class="cm-avatar placeholder">🎭</div>
						{:else if comment.authorPhoto}
							<img src={comment.authorPhoto} alt="" class="cm-avatar" referrerpolicy="no-referrer" />
						{:else}
							<div class="cm-avatar placeholder">{(comment.authorName || 'U').charAt(0)}</div>
						{/if}
					</div>
					
					<div class="cm-content-wrap">
						<div class="cm-bubble">
							<div class="cm-name" class:anon={comment.isAnonymous}>
								{comment.isAnonymous ? 'สมาชิกนิรนาม' : comment.authorName}
								{#if !comment.isAnonymous && comment.authorRole === 'admin'}
									<span class="badge-verified" title="PLEARN Verified">
										<svg viewBox="0 0 24 24" fill="#0866FF" width="12" height="12"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/><circle cx="12" cy="12" r="10"/><path d="M10.1 16.7l-4.1-4.1 1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/></svg>
									</span>
								{/if}
							</div>
							<div class="cm-text">{comment.text}</div>
						</div>
						<div class="cm-actions">
							<span class="cm-time">{getRelativeTime(comment.createdAt)}</span>
							{#if user}
								<button class="cm-reply-btn" onclick={() => startReply(comment)}>ตอบกลับ</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Nested replies -->
				{#if comment.replies && comment.replies.length > 0}
					<div class="cm-replies">
						{#each comment.replies as reply (reply.id)}
							<div class="cm-item cm-reply-item">
								<div class="cm-avatar-wrap">
									{#if reply.isAnonymous}
										<div class="cm-avatar placeholder reply-avatar">🎭</div>
									{:else if reply.authorPhoto}
										<img src={reply.authorPhoto} alt="" class="cm-avatar reply-avatar" referrerpolicy="no-referrer" />
									{:else}
										<div class="cm-avatar placeholder reply-avatar">{(reply.authorName || 'U').charAt(0)}</div>
									{/if}
								</div>
								
								<div class="cm-content-wrap">
									<div class="cm-bubble reply-bubble">
										<div class="cm-name" class:anon={reply.isAnonymous}>
											{reply.isAnonymous ? 'สมาชิกนิรนาม' : reply.authorName}
											{#if !reply.isAnonymous && reply.authorRole === 'admin'}
												<span class="badge-verified" title="PLEARN Verified">
													<svg viewBox="0 0 24 24" fill="#0866FF" width="12" height="12"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/><circle cx="12" cy="12" r="10"/><path d="M10.1 16.7l-4.1-4.1 1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/></svg>
												</span>
											{/if}
										</div>
										<div class="cm-reply-tag">@{reply.replyToName}</div>
										<div class="cm-text">{reply.text}</div>
									</div>
									<div class="cm-actions">
										<span class="cm-time">{getRelativeTime(reply.createdAt)}</span>
										{#if user}
											<button class="cm-reply-btn" onclick={() => startReply(comment)}>ตอบกลับ</button>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if user}
		{#if replyTo}
			<div class="reply-indicator">
				<span>ตอบกลับ <strong>{replyTo.authorName}</strong></span>
				<button class="cancel-reply" onclick={cancelReply}>✕</button>
			</div>
		{/if}

		<form class="cm-input-area" onsubmit={(e) => { e.preventDefault(); submitComment(); }}>
			<div class="cm-my-avatar">
				{#if userInfo?.photoURL}
					<img src={userInfo.photoURL} alt="" class="cm-avatar" referrerpolicy="no-referrer" />
				{:else}
					<div class="cm-avatar placeholder">{(userInfo?.displayName || 'U').charAt(0)}</div>
				{/if}
			</div>
			
			<div class="cm-input-box">
				<input 
					type="text" 
					class="cm-input" 
					placeholder={replyTo ? `ตอบกลับ ${replyTo.authorName}...` : (isAnonymous ? "แสดงความคิดเห็นในฐานะนิรนาม..." : "เขียนความคิดเห็น...")} 
					bind:value={newCommentText} 
				/>
				
				<div class="cm-tools">
					<label class="anon-toggle" title="เปิดโหมดนิรนาม">
						<input type="checkbox" bind:checked={isAnonymous} class="sr-only">
						<div class="t-icon" class:active={isAnonymous}>🎭</div>
					</label>
					
					<button type="submit" class="cm-send" disabled={!newCommentText.trim() || isSubmitting}>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
				</div>
			</div>
		</form>
	{/if}
</div>

<style>
	.comments-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }

	.cm-item { display: flex; gap: 8px; align-items: flex-start; }
	.cm-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
	.cm-avatar.placeholder { background: var(--color-bg-input); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }

	.cm-content-wrap { flex: 1; }
	.cm-bubble {
		background: var(--color-bg-input);
		border-radius: 16px;
		padding: 8px 12px;
		display: inline-block; max-width: 100%;
	}
	.cm-name { font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
	.cm-name.anon { font-style: italic; color: var(--color-text-muted); }
	.cm-text { font-size: 14px; line-height: 1.4; word-break: break-word; font-family: var(--font-content, var(--font-sans)); }

	.cm-actions { padding-left: 12px; margin-top: 2px; display: flex; align-items: center; gap: 8px; }
	.cm-time { font-size: 11px; color: var(--color-text-muted); }

	/* Reply Button */
	.cm-reply-btn {
		background: none; border: none; padding: 0;
		font-size: 11px; font-weight: 600; color: var(--color-text-muted);
		cursor: pointer; transition: color 0.12s;
	}
	.cm-reply-btn:hover { color: var(--color-primary); }

	/* Nested Replies */
	.cm-replies {
		margin-left: 36px; padding-left: 12px;
		border-left: 2px solid var(--color-border-light);
		display: flex; flex-direction: column; gap: 8px;
	}
	.reply-avatar { width: 24px !important; height: 24px !important; font-size: 10px !important; }
	.reply-bubble { background: var(--color-bg-hover); }
	.cm-reply-tag {
		font-size: 11px; color: var(--color-primary); font-weight: 600;
		margin-bottom: 2px;
	}

	/* Reply Indicator */
	.reply-indicator {
		display: flex; align-items: center; justify-content: space-between;
		padding: 6px 12px; margin-bottom: 4px;
		background: var(--color-primary-soft); border-radius: var(--radius-md);
		font-size: 12px; color: var(--color-primary);
	}
	.cancel-reply {
		background: none; border: none; cursor: pointer; color: var(--color-text-muted);
		width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
		border-radius: 50%; font-size: 11px; font-weight: 700;
		transition: all 0.12s;
	}
	.cancel-reply:hover { background: var(--color-bg-hover); color: var(--color-text); }

	.cm-input-area { display: flex; gap: 8px; align-items: center; }
	.cm-my-avatar { flex-shrink: 0; }

	.cm-input-box {
		flex: 1; display: flex; align-items: center;
		background: var(--color-bg-input); border-radius: var(--radius-full);
		padding: 4px 8px 4px 16px;
	}

	.cm-input {
		flex: 1; border: none; background: transparent; color: var(--color-text);
		outline: none; font-size: 14px; padding: 6px 0; font-family: var(--font-content, var(--font-sans));
	}
	.cm-input::placeholder { color: var(--color-text-muted); }

	.cm-tools { display: flex; align-items: center; gap: 2px; }

	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
	.anon-toggle { cursor: pointer; display: flex; align-items: center; justify-content: center; }
	.t-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid transparent; opacity: 0.4; transition: all 0.15s var(--ease-out); font-size: 14px; }
	.t-icon:hover { background: var(--color-bg-hover); opacity: 0.8; }
	.t-icon.active { opacity: 1; background: var(--color-bg-card); border-color: var(--color-border-light); box-shadow: var(--shadow-card); }

	.cm-send {
		background: none; border: none; color: var(--color-primary);
		width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
		cursor: pointer; transition: all 0.12s var(--ease-out);
	}
	.cm-send:disabled { color: var(--color-text-muted); cursor: not-allowed; }
	.cm-send:hover:not(:disabled) { background: var(--color-primary-soft); }
</style>
