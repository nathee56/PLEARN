<script>
	import { onDestroy } from 'svelte';
	import { db } from '$lib/firebase';
	import { currentUser, userData } from '$lib/stores/auth';
	import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

	import { showToast } from '$lib/stores/toast';
	let { postType = 'general', onClose = () => {}, editPost = null } = $props();

	let title = $state(editPost?.title || '');
	let content = $state(editPost?.content || '');
	let isAnonymous = $derived(postType === 'secret' || (editPost && editPost.type === 'secret'));
	let manualAnon = $state(editPost?.isAnonymous || false);
	let isSubmitting = $state(false);
	let textareaRef = $state(null);
	
	// Poll State
	let showPoll = $state(false);
	let pollOptions = $state(['', '']); 

	function addPollOption() {
		if (pollOptions.length >= 6) return;
		pollOptions = [...pollOptions, ''];
	}

	function removePollOption(index) {
		if (pollOptions.length <= 2) return;
		pollOptions = pollOptions.filter((_, i) => i !== index);
	}

	function insertMarkdown(type) {
		if (!textareaRef) return;
		
		const start = textareaRef.selectionStart;
		const end = textareaRef.selectionEnd;
		const selectedText = content.substring(start, end);
		let replacement = '';
		let cursorOffset = 0;

		switch (type) {
			case 'bold':
				replacement = `**${selectedText || 'ข้อความตัวหนา'}**`;
				cursorOffset = selectedText ? 0 : 2;
				break;
			case 'italic':
				replacement = `*${selectedText || 'ข้อความตัวเอียง'}*`;
				cursorOffset = selectedText ? 0 : 1;
				break;
			case 'heading':
				replacement = `\n### ${selectedText || 'หัวข้อ'}`;
				cursorOffset = 0;
				break;
			case 'link':
				replacement = `[${selectedText || 'ข้อความลิงก์'}](https://)`;
				cursorOffset = selectedText ? 12 : 1; // [ | ](https://) or [text]( | )
				break;
		}

		content = content.substring(0, start) + replacement + content.substring(end);
		
		// Focus back and set cursor
		setTimeout(() => {
			textareaRef.focus();
			const newPos = start + (selectedText ? replacement.length : replacement.length - cursorOffset);
			textareaRef.setSelectionRange(newPos, newPos);
		}, 0);
	}
	
	let files = $state([]);
	let previewUrls = $state([]);

	let user = $state(null);
	let userInfo = $state(null);

	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => (userInfo = v));

	onDestroy(() => {
		unsubUser();
		unsubUserData();
	});

	const animalNames = ['สิงโต', 'โลมา', 'กระต่าย', 'หมี', 'นกฮูก', 'จิ้งจอก', 'ฉลาม', 'แพนด้า', 'เสือ', 'แมว'];
	const colors = ['สีเทา', 'สีชมพู', 'สีฟ้า', 'สีม่วง', 'สีเขียว', 'สีส้ม', 'สีเหลือง', 'สีมิดไนท์', 'พเนจร', 'ผู้ลึกลับ'];

	function getRandomSecretName() {
		const animal = animalNames[Math.floor(Math.random() * animalNames.length)];
		const color = colors[Math.floor(Math.random() * colors.length)];
		return `${animal}${color}`;
	}

	function handleFileSelect(e) {
		const selectedFiles = Array.from(e.target.files);
		if (files.length + selectedFiles.length > 4) {
			alert('อัปโหลดรูปภาพได้สูงสุด 4 รูปเท่านั้นครับ');
			return;
		}
		
		for (const file of selectedFiles) {
			files = [...files, file];
			const url = URL.createObjectURL(file);
			previewUrls = [...previewUrls, url];
		}
	}

	function removeFile(index) {
		files = files.filter((_, i) => i !== index);
		previewUrls = previewUrls.filter((_, i) => i !== index);
	}

	async function handleSubmit() {
		if (!content.trim() || isSubmitting) return;
		if (postType === 'thread' && !title.trim()) return;
		if (!user) return;

		isSubmitting = true;

		try {
			// Upload images via ImgBB
			const imageUrls = [];
			for (const file of files) {
				const formData = new FormData();
				formData.append('image', file);
				
				try {
					const res = await fetch('https://api.imgbb.com/1/upload?key=e52c9e8136f88d58095e9beaf45bfbb3', {
						method: 'POST',
						body: formData
					});
					const data = await res.json();
					if (data.success) {
						imageUrls.push(data.data.url);
					}
				} catch (err) {
					console.error('Image upload failed:', err);
				}
			}

			const isActuallyAnon = isAnonymous || manualAnon;
			const finalAnonName = isActuallyAnon ? (editPost?.anonName || getRandomSecretName()) : null;

			// Keep existing images if editing
			const finalImages = editPost ? [...(editPost.images || []), ...imageUrls] : imageUrls;

			if (editPost) {
				await updateDoc(doc(db, 'posts', editPost.id), {
					title: postType === 'thread' ? title.trim() : null,
					content: content.trim(),
					images: finalImages,
					isAnonymous: isActuallyAnon,
					anonName: finalAnonName,
					isEdited: true
				});
				showToast('แก้ไขโพสต์แล้ว ✅', 'success');
			} else {
				await addDoc(collection(db, 'posts'), {
					authorUid: user.uid,
					authorName: isActuallyAnon ? null : (userInfo?.displayName || 'ผู้ใช้'),
					authorPhoto: isActuallyAnon ? null : (userInfo?.photoURL || ''),
					authorRole: isActuallyAnon ? null : (userInfo?.role || 'user'),
					anonName: finalAnonName,
					type: postType,
					title: postType === 'thread' ? title.trim() : null,
					content: content.trim(),
					images: finalImages,
					isAnonymous: isActuallyAnon,
					reactions: { plearn: 0, insight: 0, thanks: 0 },
					reactedBy: { plearn: [], insight: [], thanks: [] },
					commentCount: 0,
					createdAt: serverTimestamp(),
					
					// Poll Data
					poll: showPoll && pollOptions.filter(opt => opt.trim()).length >= 2 ? {
						options: pollOptions.filter(opt => opt.trim()).map(opt => ({ text: opt.trim(), votes: 0 })),
						votedBy: {},
						totalVotes: 0
					} : null
				});
				showToast('สำเร็จ! โพสต์ถูกสร้างแล้ว ✨', 'success');
			}

			// Add custom event instead of page reload
			// Wait a tiny bit to ensure Firestore sync
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent('post-created', { detail: { type: postType } }));
				title = '';
				content = '';
				files = [];
				previewUrls = [];
				showPoll = false;
				pollOptions = ['', ''];
				onClose();
			}, 300);

		} catch (error) {
			console.error('Error adding/updating document: ', error);
			showToast('เกิดข้อผิดพลาดในการโพสต์', 'error');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="classic-card composer animate-fade-in">
	<div class="c-header">
		<h3 class="c-title">{editPost ? 'แก้ไขโพสต์' : 'สร้างโพสต์'}</h3>
		<button class="c-close" onclick={onClose} aria-label="ปิด">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</button>
	</div>
	
	<div class="c-body">
		<div class="c-author">
			{#if isAnonymous || manualAnon}
				<div class="c-avatar placeholder">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>
				</div>
				<div>
					<div class="c-name">{postType === 'secret' ? 'นามแฝงแบบสุ่ม (ปลอดภัย)' : 'สมาชิกนิรนาม'}</div>
					<div class="c-privacy">{postType === 'secret' ? 'พื้นที่ลับสุดยอด' : 'ซ่อนตัวตน'}</div>
				</div>
			{:else}
				{#if userInfo?.photoURL}
					<img src={userInfo.photoURL} alt="" class="c-avatar" referrerpolicy="no-referrer" />
				{:else}
					<div class="c-avatar placeholder">{(userInfo?.displayName || 'U').charAt(0)}</div>
				{/if}
				<div>
					<div class="c-name">{userInfo?.displayName || 'ผู้ใช้'}</div>
					<div class="c-privacy">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> 
						สาธารณะ
					</div>
				</div>
			{/if}
		</div>

		{#if postType === 'thread'}
			<input type="text" class="c-input title-input" placeholder="เพิ่มหัวข้อกระทู้..." bind:value={title} />
		{/if}
		
		<div class="markdown-toolbar">
			<button type="button" class="mt-btn" onclick={() => insertMarkdown('bold')} title="ตัวหนา"><b>B</b></button>
			<button type="button" class="mt-btn" onclick={() => insertMarkdown('italic')} title="ตัวเอียง"><i>I</i></button>
			<button type="button" class="mt-btn" onclick={() => insertMarkdown('heading')} title="หัวข้อ">H</button>
			<button type="button" class="mt-btn" onclick={() => insertMarkdown('link')} title="แทรกลิงก์">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
			</button>
		</div>

		<textarea 
			bind:this={textareaRef}
			class="c-input content-input" 
			placeholder={postType === 'secret' ? "ระบายความลับของคุณ..." : (postType === 'thread' ? "อธิบายรายละเอียด..." : `คุณกำลังคิดอะไรอยู่ ${userInfo?.displayName?.split(' ')[0] || ''}?`)}
			bind:value={content}
			rows="4"
		></textarea>
		<div class="markdown-hint">รองรับ **ตัวหนา** *ตัวเอียง* แบบ Markdown</div>

		{#if previewUrls.length > 0}
			<div class="image-previews">
				{#each previewUrls as url, i}
					<div class="img-preview-box">
						<img src={url} alt="preview" />
						<button class="remove-img-btn" onclick={() => removeFile(i)} aria-label="ลบรูป">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}

		{#if showPoll}
			<div class="c-poll-editor animate-fade-in">
				<div class="poll-header">
					<span class="poll-title-label">ตัวเลือกโพล (สูงสุด 6)</span>
					<button class="poll-close-btn" onclick={() => showPoll = false}>ยกเลิกโพล</button>
				</div>
				<div class="poll-options-list">
					{#each pollOptions as opt, i}
						<div class="poll-opt-input-row">
							<input 
								type="text" 
								class="poll-opt-input" 
								placeholder="ตัวเลือกที่ {i + 1}" 
								bind:value={pollOptions[i]} 
								maxlength="50"
							/>
							{#if pollOptions.length > 2}
								<button class="opt-remove-btn" onclick={() => removePollOption(i)}>✕</button>
							{/if}
						</div>
					{/each}
				</div>
				{#if pollOptions.length < 6}
					<button class="add-opt-btn" onclick={addPollOption}>+ เพิ่มตัวเลือก</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="c-options">
		<div class="c-options-left">
			<label class="image-upload-btn action-circle hover-lift" title="แนบรูปภาพ">
				<input type="file" multiple accept="image/*" class="sr-only" onchange={handleFileSelect}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
			</label>
			<button class="action-circle hover-lift" class:active={showPoll} onclick={() => showPoll = !showPoll} title="สร้างโพล" type="button">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
			</button>
		</div>
		
		{#if postType !== 'secret'}
			<label class="toggle-container" title="โหมดนิรนาม">
				<input type="checkbox" bind:checked={manualAnon} class="sr-only">
				<div class="toggle-btn" class:active={manualAnon}>
					🎭 เล่าแบบนิรนาม
				</div>
			</label>
		{/if}
	</div>

	<div class="c-footer">
		<button class="classic-btn btn-primary publish-btn w-full" onclick={handleSubmit} disabled={isSubmitting || !content.trim() || (postType === 'thread' && !title.trim())}>
			{#if isSubmitting} กำลังบันทึก... {:else} {editPost ? 'บันทึกการแก้ไข' : 'โพสต์ลงคอมมูนิตี้'} ✨ {/if}
		</button>
	</div>
</div>

<style>
	.composer { overflow: hidden; }
	.c-header {
		display: flex; justify-content: space-between; align-items: center;
		padding: 16px 20px; border-bottom: 1px solid var(--color-border-light);
	}
	.c-title { font-weight: 700; font-size: 17px; flex: 1; text-align: center; margin-left: 24px; }
	.c-close {
		width: 32px; height: 32px; border-radius: 50%;
		background-color: var(--color-bg-input); border: none;
		color: var(--color-text-secondary); cursor: pointer;
		display: flex; align-items: center; justify-content: center; font-size: 14px;
		transition: background 0.12s var(--ease-out);
	}
	.c-close:hover { background-color: var(--color-bg-hover); }

	.c-body { padding: 16px 20px; }
	.c-author { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
	.c-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
	.c-avatar.placeholder { background-color: var(--color-bg-input); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
	.c-name { font-weight: 600; font-size: 14px; line-height: 1.2; }
	.c-privacy { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--color-text-muted); background: var(--color-bg-hover); padding: 2px 8px; border-radius: var(--radius-xs); margin-top: 4px; font-weight: 500; }

	.c-input {
		width: 100%; border: none; background: transparent; color: var(--color-text);
		outline: none; resize: none; font-family: inherit; font-size: 17px;
	}
	.c-input::placeholder { color: var(--color-text-muted); }

	.title-input { font-weight: 700; border-bottom: 1px solid var(--color-border-light); padding-bottom: 8px; margin-bottom: 8px; }
	.content-input { font-size: 15px; }
	.markdown-hint { font-size: 11px; color: var(--color-text-muted); margin-bottom: 8px; display: block; }

	.image-previews { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
	.img-preview-box { position: relative; width: 72px; height: 72px; border-radius: var(--radius-md); overflow: hidden; }
	.img-preview-box img { width: 100%; height: 100%; object-fit: cover; }
	.remove-img-btn { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; cursor: pointer; transition: background 0.12s; }
	.remove-img-btn:hover { background: rgba(0,0,0,0.8); }

	.c-options {
		display: flex; align-items: center; justify-content: space-between;
		padding: 8px 16px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
		margin: 0 16px 16px;
	}
	.c-options-left { display: flex; gap: 4px; }
	.image-upload-btn { cursor: pointer; padding: 8px; font-size: 18px; border-radius: 50%; transition: background 0.12s var(--ease-out); }
	.image-upload-btn:hover { background: var(--color-bg-hover); }

	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
	.toggle-btn {
		padding: 6px 12px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600;
		background: var(--color-bg-hover); color: var(--color-text-muted); cursor: pointer;
		transition: all 0.12s var(--ease-out);
	}
	.toggle-btn.active { background: var(--color-primary-soft); color: var(--color-primary); }

	.c-footer { padding: 0 16px 16px; }
	.w-full { width: 100%; }

	/* Poll Editor */
	.c-poll-editor {
		background: var(--color-bg-input);
		border-radius: var(--radius-md);
		padding: 16px;
		margin-top: 16px;
	}
	.poll-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
	.poll-title-label { font-size: 11px; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.06em; }
	.poll-close-btn { background: none; border: none; color: var(--color-danger); font-size: 12px; font-weight: 600; cursor: pointer; }
	.poll-close-btn:hover { text-decoration: underline; }

	.poll-options-list { display: flex; flex-direction: column; gap: 8px; }
	.poll-opt-input-row { display: flex; align-items: center; gap: 8px; }
	.poll-opt-input {
		flex: 1; background: var(--color-bg-card); border: 1.5px solid var(--color-border);
		padding: 10px 12px; border-radius: var(--radius-md); color: var(--color-text);
		font-size: 14px; outline: none; transition: border-color 0.15s;
	}
	.poll-opt-input:focus { border-color: var(--color-primary); }
	.opt-remove-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; padding: 4px; transition: color 0.12s; }
	.opt-remove-btn:hover { color: var(--color-danger); }

	.add-opt-btn {
		width: 100%; margin-top: 8px; padding: 8px; border: 1.5px dashed var(--color-border);
		background: none; color: var(--color-primary); font-size: 13px; font-weight: 600;
		border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s var(--ease-out);
	}
	.add-opt-btn:hover { background: var(--color-primary-soft); border-style: solid; }

	.action-circle.active { background: var(--color-primary-soft); color: var(--color-primary); }

	/* Markdown Toolbar */
	.markdown-toolbar {
		display: flex; gap: 2px; margin-bottom: 8px;
	}
	.mt-btn {
		background: none; border: none; color: var(--color-text-muted);
		padding: 4px 8px; border-radius: var(--radius-xs); cursor: pointer; font-family: inherit;
		font-size: 13px; font-weight: 600; transition: all 0.12s var(--ease-out);
	}
	.mt-btn:hover { background: var(--color-bg-hover); color: var(--color-primary); }
</style>
