<script>
	import { onMount, onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { currentUser, userData } from '$lib/stores/auth';
	import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, addDoc, collection, serverTimestamp, increment, getDoc } from 'firebase/firestore';
	import { getRelativeTime } from '$lib/utils/time';
	import { marked } from 'marked';
	import CommentSection from './CommentSection.svelte';
	import ImageLightbox from './ImageLightbox.svelte';
	import { showToast } from '$lib/stores/toast';

	let { post, showCommentsDefault = false } = $props();

	let user = $state(null);
	let userInfo = $state(null);
	let showComments = $state(showCommentsDefault);
	let isProcessingAction = $state(false);
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let isAuthorOnline = $state(false);
	let animatingReaction = $state(null);
	let isEditingPost = $state(false);

	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => (userInfo = v));

	onMount(async () => {
		// Check author online status (non-anonymous only)
		if (!post.isAnonymous && post.authorUid) {
			try {
				const userDoc = await getDoc(doc(db, 'users', post.authorUid));
				if (userDoc.exists()) {
					const lastActive = userDoc.data().lastActive?.toDate?.();
					if (lastActive && (Date.now() - lastActive.getTime()) < 5 * 60 * 1000) {
						isAuthorOnline = true;
					}
				}
			} catch (e) { /* ignore */ }
		}
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
	});

	let isAuthorVerified = $derived(post.authorRole === 'admin');
	
	function hasReacted(type) {
		if (!user || !post.reactedBy) return false;
		return post.reactedBy[type]?.includes(user.uid) || false;
	}

	async function toggleReaction(type) {
		if (!user || isProcessingAction) return;
		isProcessingAction = true;

		const postRef = doc(db, 'posts', post.id);
		const currentlyReacted = hasReacted(type);
		
		try {
			if (currentlyReacted) {
				await updateDoc(postRef, {
					[`reactions.${type}`]: increment(-1),
					[`reactedBy.${type}`]: arrayRemove(user.uid)
				});
			} else {
				// Trigger animation
				animatingReaction = type;
				setTimeout(() => animatingReaction = null, 400);

				await updateDoc(postRef, {
					[`reactions.${type}`]: increment(1),
					[`reactedBy.${type}`]: arrayUnion(user.uid)
				});

				// Send notification to author if it's not the same user
				if (post.authorUid !== user.uid) {
					await addDoc(collection(db, 'notifications'), {
						forUid: post.authorUid,
						fromUid: user.uid,
						fromName: userInfo?.displayName || user.displayName || 'สมาชิก',
						type: 'like',
						postId: post.id,
						isRead: false,
						createdAt: serverTimestamp()
					});
				}
			}
		} catch (error) {
			console.error('Error updating reaction:', error);
		} finally {
			isProcessingAction = false;
		}
	}

	async function deletePost() {
		if (!confirm('ยืนยันที่จะลบโพสต์นี้ใช่ไหม?')) return;
		isProcessingAction = true;
		try {
			await deleteDoc(doc(db, 'posts', post.id));
			showToast('ลบโพสต์แล้ว', 'success');
		} catch (e) {
			console.error('Error deleting post:', e);
			showToast('ลบโพสต์ไม่สำเร็จ', 'error');
		} finally {
			isProcessingAction = false;
		}
	}

	async function togglePin() {
		if (isProcessingAction || userInfo?.role !== 'admin') return;
		isProcessingAction = true;
		try {
			await updateDoc(doc(db, 'posts', post.id), {
				isPinned: !post.isPinned
			});
			showToast(!post.isPinned ? 'ปักหมุดโพสต์แล้ว 📌' : 'ปลดหมุดโพสต์แล้ว', 'success');
		} catch (e) {
			console.error('Error toggling pin:', e);
			showToast('เกิดข้อผิดพลาด', 'error');
		} finally {
			isProcessingAction = false;
		}
	}

	function formatContent(text) {
		if (!text) return '';
		try {
			// Convert markdown to HTML securely (allow basic things)
			return marked.parse(text, { breaks: true, gfm: true });
		} catch (e) {
			return text.split('\n').join('<br/>');
		}
	}
	
	// Helper to calculate total reactions
	let totalReactions = $derived((post.reactions?.plearn || 0) + (post.reactions?.insight || 0) + (post.reactions?.thanks || 0));

	// Poll Logic
	let hasVoted = $derived(user && post.poll?.votedBy && post.poll.votedBy[user.uid] !== undefined);
	let userVoteIndex = $derived(hasVoted ? post.poll.votedBy[user.uid] : null);

	async function handleVote(index) {
		if (!user || hasVoted || isProcessingAction) return;
		isProcessingAction = true;

		try {
			const postRef = doc(db, 'posts', post.id);
			
			// Create new options array with incremented vote
			const newOptions = [...post.poll.options];
			newOptions[index] = { ...newOptions[index], votes: (newOptions[index].votes || 0) + 1 };

			await updateDoc(postRef, {
				'poll.options': newOptions,
				[`poll.votedBy.${user.uid}`]: index,
				'poll.totalVotes': increment(1)
			});
		} catch (error) {
			console.error('Error voting:', error);
		} finally {
			isProcessingAction = false;
		}
	}

	function calculatePercent(votes) {
		if (!post.poll?.totalVotes) return 0;
		return Math.round((votes / post.poll.totalVotes) * 100);
	}
</script>

<article class="classic-card post-wrapper animate-fade-in" class:mystic-theme={post.type === 'secret'}>
	{#if isEditingPost}
		<div class="edit-wrapper">
			<CreatePost 
				postType={post.type} 
				editPost={post} 
				onClose={() => isEditingPost = false} 
			/>
		</div>
	{:else}
		<!-- Author Header -->
		{#if post.isPinned}
		<div class="pc-pinned-bar">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 1 0 3.986 3.986L21.174 6.812z"/><path d="m22 2-7.89 7.89"/></svg>
			โพสต์ปักหมุด
		</div>
	{/if}
	<div class="pc-header">
		<div class="pc-avatar-wrapper">
			{#if post.isAnonymous}
				<div class="pc-avatar placeholder anon">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>
				</div>
			{:else if post.authorPhoto}
				<img src={post.authorPhoto} alt="" class="pc-avatar" referrerpolicy="no-referrer" />
			{:else}
				<div class="pc-avatar placeholder">{(post.authorName || 'U').charAt(0)}</div>
			{/if}
			{#if isAuthorOnline}
				<span class="online-dot"></span>
			{/if}
		</div>
		<div class="pc-meta-wrapper">
			<div class="pc-name-row">
				<span class="pc-name" class:anon={post.isAnonymous}>
					{post.anonName || (post.isAnonymous ? 'สมาชิกนิรนาม' : post.authorName)}
				</span>
				{#if !post.isAnonymous && isAuthorVerified}
					<span class="badge-verified" title="PLEARN Verified">
						<svg viewBox="0 0 24 24" fill="#0866FF" width="14" height="14"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/><circle cx="12" cy="12" r="10"/><path d="M10.1 16.7l-4.1-4.1 1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" fill="#FFF"/></svg>
					</span>
				{/if}
			</div>
			<div class="pc-time-row">
				<span>{getRelativeTime(post.createdAt)}</span> • <span>{post.type === 'secret' ? 'พื้นที่ลับสุดยอด' : (post.isAnonymous ? 'นิรนาม' : 'สาธารณะ')}</span>
			</div>
		</div>
		<div class="pc-header-options">
			{#if userInfo?.role === 'admin'}
				<button class="options-btn" class:active={post.isPinned} onclick={togglePin} disabled={isProcessingAction}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 1 0 3.986 3.986L21.174 6.812z"/><path d="m22 2-7.89 7.89"/></svg>
				</button>
			{/if}
			{#if post.authorUid === user?.uid}
				<button class="options-btn" onclick={() => isEditingPost = true} disabled={isProcessingAction}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
				</button>
			{/if}
			{#if userInfo?.role === 'admin' || post.authorUid === user?.uid}
				<button class="options-btn delete" onclick={deletePost} disabled={isProcessingAction}>ลบ</button>
			{/if}
		</div>
	</div>

	<div class="pc-content">
		{#if post.type === 'thread' && post.title}
			<h2 class="pc-title">{post.title}</h2>
		{/if}
		<div class="pc-text markdown-body">
			{@html formatContent(post.content)}
		</div>

		{#if post.images && post.images.length > 0}
			<div class="pc-gallery grid-{post.images.length > 4 ? 4 : post.images.length}">
				{#each post.images.slice(0, 4) as img, i}
					<button class="gallery-item" onclick={() => { lightboxIndex = i; lightboxOpen = true; }} type="button">
						<img src={img} alt="post" />
						{#if i === 3 && post.images.length > 4}
							<div class="more-images">+{post.images.length - 4}</div>
						{/if}
					</button>
				{/each}
			</div>

			{#if lightboxOpen}
				<ImageLightbox images={post.images} startIndex={lightboxIndex} onClose={() => lightboxOpen = false} />
			{/if}
		{/if}

		{#if post.poll}
			<div class="pc-poll animate-fade-in">
				<div class="poll-options">
					{#each post.poll.options as opt, i}
						{#if hasVoted}
							<div class="poll-result-row" class:my-vote={userVoteIndex === i}>
								<div class="poll-bar-bg">
									<div class="poll-bar-fill" style="width: {calculatePercent(opt.votes)}%"></div>
								</div>
								<div class="poll-result-info">
									<span class="opt-text">
										{opt.text}
										{#if userVoteIndex === i} 
											<span class="voted-tick">
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
											</span> 
										{/if}
									</span>
									<span class="opt-percent">{calculatePercent(opt.votes)}%</span>
								</div>
							</div>
						{:else}
							<button 
								class="poll-opt-btn" 
								onclick={() => handleVote(i)} 
								disabled={isProcessingAction || !user}
							>
								{opt.text}
							</button>
						{/if}
					{/each}
				</div>
				<div class="poll-footer">
					<span class="total-votes">{post.poll.totalVotes || 0} การโหวต</span>
					{#if !user}
						<span class="login-hint">เข้าสู่ระบบเพื่อโหวต</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Reaction Stats -->
	<div class="pc-stats">
		<div class="stats-left">
			{#if totalReactions > 0}
				<div class="reaction-icons-stack">
					{#if post.reactions?.plearn > 0}
						<span class="r-stack-icon i-plearn">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
						</span>
					{/if}
					{#if post.reactions?.insight > 0}
						<span class="r-stack-icon i-insight">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M15 14v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2"/><path d="M10 22h4"/></svg>
						</span>
					{/if}
					{#if post.reactions?.thanks > 0}
						<span class="r-stack-icon i-thanks">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
						</span>
					{/if}
				</div>
				<span class="stats-text">{totalReactions}</span>
			{/if}
		</div>
		<div class="stats-right">
			{#if post.commentCount > 0}
				<span class="stats-text hover-underline" onclick={() => showComments = true}>{post.commentCount} ความคิดเห็น</span>
			{/if}
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="pc-actions">
		<button class="action-btn r-plearn" class:active={hasReacted('plearn')} class:animating={animatingReaction === 'plearn'} onclick={() => toggleReaction('plearn')}>
			<span class="a-icon">
				<svg width="20" height="20" viewBox="0 0 24 24" fill={hasReacted('plearn') ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
			</span> 
			<span>เพลิน</span>
		</button>
		<button class="action-btn r-insight" class:active={hasReacted('insight')} class:animating={animatingReaction === 'insight'} onclick={() => toggleReaction('insight')}>
			<span class="a-icon">
				<svg width="20" height="20" viewBox="0 0 24 24" fill={hasReacted('insight') ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M15 14v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2"/><path d="M10 22h4"/></svg>
			</span> 
			<span>ได้ความรู้</span>
		</button>
		<button class="action-btn r-thanks" class:active={hasReacted('thanks')} class:animating={animatingReaction === 'thanks'} onclick={() => toggleReaction('thanks')}>
			<span class="a-icon">
				<svg width="20" height="20" viewBox="0 0 24 24" fill={hasReacted('thanks') ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
			</span> 
			<span>ขอบคุณ</span>
		</button>
		<button class="action-btn r-comment" onclick={() => (showComments = !showComments)}>
			<span class="a-icon">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
			</span> 
			<span>แสดงความเห็น</span>
		</button>
	</div>

	<!-- Comments -->
	{#if showComments && !isEditingPost}
		<div class="pc-comments">
			<CommentSection postId={post.id} postAuthorUid={post.authorUid} />
		</div>
	{/if}
	{/if}<!-- End isEditingPost else block -->
</article>

<style>
	.post-wrapper { margin-bottom: 12px; }
	.edit-wrapper { margin: -1px; } /* To overlay nicely inside the card */

	.pc-pinned-bar {
		display: flex; align-items: center; gap: 6px; padding: 12px 20px 0;
		font-size: 13px; font-weight: 600; color: var(--color-text-muted);
	}

	.pc-header { display: flex; align-items: center; padding: 16px 20px 8px; gap: 10px; }
	.pc-avatar-wrapper { flex-shrink: 0; position: relative; }
	.online-dot {
		position: absolute; bottom: 0; right: 0;
		width: 10px; height: 10px; border-radius: 50%;
		background: var(--color-success); border: 2px solid var(--color-bg-card);
	}
	.pc-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
	.pc-avatar.placeholder { background: var(--color-bg-input); display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--color-text-secondary); font-size: 14px; }
	.pc-avatar.anon { color: var(--color-text-secondary); }

	.pc-meta-wrapper { display: flex; flex-direction: column; flex: 1; }
	.pc-name-row { display: flex; align-items: center; gap: 4px; }
	.pc-name { font-weight: 600; font-size: 14px; color: var(--color-text); }
	.pc-name.anon { color: var(--color-text-muted); font-style: italic; }
	.badge-verified { display: flex; align-items: center; margin-left: 2px; }

	.pc-time-row { font-size: 12px; color: var(--color-text-muted); display: flex; gap: 4px; }

	.pc-header-options { align-self: flex-start; display: flex; align-items: center; gap: 4px; }
	.options-btn { 
		background: none; border: none; color: var(--color-text-muted); padding: 6px; 
		border-radius: var(--radius-sm); cursor: pointer; transition: background 0.12s; 
		display: flex; align-items: center; justify-content: center;
	}
	.options-btn:hover { background: var(--color-bg-hover); color: var(--color-text); }
	.options-btn.active { color: var(--color-primary); }
	.options-btn.delete { color: var(--color-danger); font-size: 12px; font-weight: 600; }
	.options-btn.delete:hover { background: rgba(255, 59, 48, 0.08); }
	.options-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.pc-content { padding: 8px 20px; }
	.pc-title { font-size: 17px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.01em; }
	.pc-text { font-size: 15px; line-height: 1.5; word-break: break-word; overflow-wrap: break-word; font-family: var(--font-content, var(--font-sans)); }

	/* Markdown */
	:global(.markdown-body p) { margin-bottom: 8px; }
	:global(.markdown-body strong) { font-weight: 700; color: var(--color-primary); }
	:global(.markdown-body em) { font-style: italic; color: var(--color-text-secondary); }
	:global(.markdown-body blockquote) { border-left: 3px solid var(--color-primary); padding: 8px 16px; color: var(--color-text-secondary); margin: 8px 0; background: var(--color-bg-hover); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
	:global(.markdown-body h1, .markdown-body h2, .markdown-body h3) { font-weight: 700; margin: 16px 0 8px 0; line-height: 1.3; }

	/* Gallery */
	.pc-gallery { display: grid; gap: 2px; margin-top: 12px; border-radius: var(--radius-md); overflow: hidden; }
	.grid-1 { grid-template-columns: 1fr; }
	.grid-2 { grid-template-columns: 1fr 1fr; }
	.grid-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 200px 200px; }
	.grid-3 .gallery-item:first-child { grid-row: span 2; }
	.grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 150px 150px; }

	.gallery-item { position: relative; width: 100%; height: 100%; max-height: 400px; display: flex; align-items: center; justify-content: center; background: #000; border: none; padding: 0; cursor: zoom-in; }
	.gallery-item img { width: 100%; height: 100%; object-fit: cover; }
	.grid-1 .gallery-item { max-height: none; }
	.more-images { position: absolute; inset: 0; background: rgba(0,0,0,0.5); color: white; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; }

	.pc-stats {
		display: flex; justify-content: space-between; align-items: center;
		padding: 8px 20px; border-bottom: 1px solid var(--color-border-light);
	}
	.stats-left, .stats-right { display: flex; align-items: center; gap: 4px; }
	.reaction-icons-stack { display: flex; }
	.r-stack-icon { font-size: 13px; width: 14px; margin-right: 2px; }
	.stats-text { font-size: 13px; color: var(--color-text-muted); }
	.hover-underline { cursor: pointer; }
	.hover-underline:hover { text-decoration: underline; }

	.pc-actions { display: flex; padding: 4px 12px; border-bottom: 1px solid var(--color-border-light); }
	.action-btn {
		flex: 1; display: flex; justify-content: center; align-items: center; gap: 6px;
		padding: 8px 0; background: none; border: none; border-radius: var(--radius-sm);
		color: var(--color-text-muted); font-weight: 600; font-size: 13px;
		cursor: pointer; transition: all 0.12s var(--ease-out);
	}
	.action-btn:hover { background-color: var(--color-bg-hover); color: var(--color-text); }

	.action-btn.active.r-plearn { color: var(--color-primary); }
	.action-btn.active.r-insight { color: #ffab00; }
	.action-btn.active.r-thanks { color: #ff5c8d; }
	.action-btn.active { font-weight: 700; }

	.a-icon { display: flex; align-items: center; justify-content: center; }

	/* Reaction Animation */
	.action-btn.animating .a-icon svg {
		animation: reactionPop 0.4s var(--ease-spring);
	}
	
	@keyframes reactionPop {
		0% { transform: scale(1); }
		40% { transform: scale(1.6) translateY(-4px); }
		100% { transform: scale(1); }
	}

	.i-plearn { color: var(--color-primary); }
	.i-insight { color: #ffab00; }
	.i-thanks { color: #ff5c8d; }

	.pc-comments { padding: 16px 20px; }

	/* Mystic Theme */
	.mystic-theme { background: linear-gradient(to bottom, #1E1B4B, #111827) !important; color: #E5E7EB !important; border-color: #374151 !important; box-shadow: 0 4px 20px rgba(139,92,246,0.15) !important; }
	.mystic-theme .pc-name { color: #A78BFA !important; }
	.mystic-theme .pc-time-row, .mystic-theme .pc-text :global(*) { color: #D1D5DB !important; }
	.mystic-theme .pc-text :global(strong) { color: #F87171 !important; }
	.mystic-theme .pc-stats { border-color: rgba(255,255,255,0.1) !important; }
	.mystic-theme .pc-actions { border-color: rgba(255,255,255,0.1) !important; }
	.mystic-theme .action-btn { color: #9CA3AF !important; }
	.mystic-theme .action-btn:hover { background: rgba(255,255,255,0.05) !important; color: white !important; }
	.mystic-theme .action-btn.active { color: #A78BFA !important; }

	/* Poll */
	.pc-poll {
		margin-top: 12px; padding: 16px; background: var(--color-bg-input);
		border-radius: var(--radius-md);
	}
	.poll-options { display: flex; flex-direction: column; gap: 8px; }

	.poll-opt-btn {
		width: 100%; padding: 10px 16px; border: 1.5px solid var(--color-border);
		background: var(--color-bg-card); color: var(--color-text); font-weight: 600;
		border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s var(--ease-out);
		text-align: left; font-size: 14px;
	}
	.poll-opt-btn:hover:not(:disabled) {
		border-color: var(--color-primary); color: var(--color-primary);
		background: var(--color-primary-soft);
	}
	.poll-opt-btn:disabled { opacity: 0.6; cursor: default; }

	.poll-result-row { position: relative; padding: 10px 0; }
	.poll-bar-bg {
		position: absolute; inset: 0; background: var(--color-bg-card);
		border-radius: var(--radius-sm); overflow: hidden; height: 100%;
	}
	.poll-bar-fill {
		height: 100%; background: var(--color-primary-soft);
		transition: width 0.8s var(--ease-spring);
		border-right: 2px solid var(--color-primary);
	}
	.poll-result-info {
		position: relative; z-index: 1; display: flex; justify-content: space-between;
		padding: 0 16px; font-weight: 600; font-size: 14px;
	}
	.my-vote .poll-bar-fill { background: rgba(24, 119, 242, 0.15); }
	.my-vote .opt-text { color: var(--color-primary); }
	.voted-tick { margin-left: 4px; }

	.poll-footer {
		display: flex; justify-content: space-between; align-items: center;
		margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light);
	}
	.total-votes { font-size: 12px; color: var(--color-text-muted); font-weight: 600; }
	.login-hint { font-size: 11px; color: var(--color-text-muted); font-style: italic; }

	@media (max-width: 480px) {
		.action-btn span:not(.a-icon) { display: none; }
		.post-wrapper { border-radius: 0; border-left: none; border-right: none; width: 100%; box-sizing: border-box; }
	}
</style>
