<script>
	import { dev } from '$app/environment';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	
	injectAnalytics({ mode: dev ? 'development' : 'production' });

	import { onMount, onDestroy } from 'svelte';
	import { 
		currentUser, userData, authLoading, initAuth, 
		loginWithGoogle, loginWithFacebook, loginWithEmail, registerWithEmail,
		completeOnboarding
	} from '$lib/stores/auth';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import { db } from '$lib/firebase';
	import { collection, query, where, getCountFromServer, getDocs, limit, orderBy, startAt, endAt } from 'firebase/firestore';
	import { page } from '$app/stores';
	import NotificationDropdown from '$lib/components/NotificationDropdown.svelte';
	import GlobalChat from '$lib/components/GlobalChat.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import './layout.css';

	let { children } = $props();

	let user = $state(null);
	let userInfo = $state(null);
	let loading = $state(true);
	let searchInputRef = $state(null);

	const unsubUser = currentUser.subscribe((v) => (user = v));
	const unsubUserData = userData.subscribe((v) => (userInfo = v));
	const unsubLoading = authLoading.subscribe((v) => (loading = v));

	let unsubAuth;

	// Auth Form States
	let isRegistering = $state(false);
	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let authError = $state('');
	let isAuthenticating = $state(false);

	// Stats
	let totalUsers = $state('...');
	let onlineUsers = $state('...');
	let postsToday = $state('...');
	let searchQuery = $state('');
	
	// Promo Section States
	let promoSection = $state(null);
	let videoContainer = $state(null);
	let isVideoVisible = $state(false);
	
	// Real-time Search States
	let searchResults = $state([]);
	let isSearching = $state(false);
	let showSearchDropdown = $state(false);
	let searchTimeout;

	// Onboarding States
	let onboardingName = $state('');
	let isSavingOnboarding = $state(false);

	$effect(() => {
		if (userInfo && userInfo.isSetupComplete === false && !onboardingName) {
			onboardingName = userInfo.displayName || '';
		}
	});

	async function handleCompleteSetup(e) {
		e.preventDefault();
		if (!onboardingName.trim() || isSavingOnboarding) return;
		isSavingOnboarding = true;
		try {
			await completeOnboarding(onboardingName.trim());
		} catch(err) {
			console.error(err);
		} finally {
			isSavingOnboarding = false;
		}
	}

	// Spotlight Hover Interaction
	function handleSpotlightMove(e) {
		const grid = e.currentTarget;
		const rect = grid.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		grid.style.setProperty('--mouse-x', `${x}px`);
		grid.style.setProperty('--mouse-y', `${y}px`);
	}

	function scrollToPromo() {
		if (promoSection) {
			promoSection.scrollIntoView({ behavior: 'smooth' });
		}
	}
	onMount(() => {
		unsubAuth = initAuth();
		fetchStats();
	});

	// Svelte 5 Effect to handle Intersection Observer when videoContainer is bound
	$effect(() => {
		if (videoContainer) {
			const observer = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						isVideoVisible = true;
					}
				});
			}, { threshold: 0.3 });

			observer.observe(videoContainer);

			return () => {
				observer.unobserve(videoContainer);
			};
		}
	});

	onDestroy(() => {
		unsubUser();
		unsubUserData();
		unsubLoading();
		if (unsubAuth) unsubAuth();
	});

	async function fetchStats() {
		try {
			// Total Register
			const totalSnap = await getCountFromServer(collection(db, 'users'));
			totalUsers = totalSnap.data().count;

			// Online Users (Active in last 5 mins)
			const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
			const qOnline = query(collection(db, 'users'), where('lastActive', '>=', fiveMinsAgo));
			const onlineSnap = await getCountFromServer(qOnline);
			onlineUsers = onlineSnap.data().count;

			// Posts Today
			const startOfToday = new Date();
			startOfToday.setHours(0, 0, 0, 0);
			const qPosts = query(collection(db, 'posts'), where('createdAt', '>=', startOfToday));
			const postsSnap = await getCountFromServer(qPosts);
			postsToday = postsSnap.data().count;
		} catch (error) {
			console.error("Failed to fetch stats:", error);
			totalUsers = "ไม่ระบุ";
			onlineUsers = "ไม่ระบุ";
			postsToday = "0";
		}
	}

	async function handleEmailAuth(e) {
		e.preventDefault();
		if (!email || !password || isAuthenticating) return;
		isAuthenticating = true;
		authError = '';

		try {
			if (isRegistering) {
				if (!displayName) { throw new Error('กรุณากรอกชื่อผู้ใช้'); }
				await registerWithEmail(email, password, displayName);
			} else {
				await loginWithEmail(email, password);
			}
			window.location.href = '/';
		} catch (error) {
			console.error(error);
			authError = error.message;
		} finally {
			isAuthenticating = false;
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		if (searchQuery.trim()) {
			window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
			showSearchDropdown = false;
		}
	}

	async function performSearch(val) {
		if (!val.trim()) {
			searchResults = [];
			showSearchDropdown = false;
			return;
		}

		isSearching = true;
		showSearchDropdown = true;
		
		try {
			// Search users by display name (case sensitive prefix matching)
			// For better search, we should normalize display names or use a dedicated search index, 
			// but for now we'll do basic prefix matching.
			const q = query(
				collection(db, 'users'),
				where('displayName', '>=', val),
				where('displayName', '<=', val + '\uf8ff'),
				limit(5)
			);
			
			const snap = await getDocs(q);
			searchResults = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
		} catch (err) {
			console.error("Search failed:", err);
		} finally {
			isSearching = false;
		}
	}

	function handleSearchInput(e) {
		const val = e.target.value;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			performSearch(val);
		}, 300);
	}
</script>

<svelte:head>
	<title>PLEARN เพลิน</title>
</svelte:head>

{#if loading}
	<div class="loading-screen">
		<div class="spinner"></div>
	</div>
{:else}
	<!-- TOP NAVIGATION BAR -->
	<header class="top-nav">
		<div class="nav-container">
			<div class="nav-left">
				{#if !user}
					<a href="/" class="nav-brand-group">
						<img src="/logo.png" class="nav-logo-image" alt="PLEARN Logo" />
						<span class="nav-brand-text">PLEARN</span>
					</a>
				{:else}
					<a href="/" class="nav-brand-group">
						<img src="/logo.png" class="nav-logo-image" alt="PLEARN Logo" />
						<span class="nav-brand-text">PLEARN</span>
					</a>
				{/if}
				
				<!-- Search Bar -->
				{#if user}
					<form class="nav-search" onsubmit={handleSearch} onclick={() => searchInputRef?.focus()}>
						<svg class="search-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="pointer-events: none;">
							<path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"></path>
						</svg>
						<input 
							bind:this={searchInputRef}
							type="text" 
							placeholder="ค้นหา..." 
							bind:value={searchQuery} 
							oninput={handleSearchInput}
							onfocus={() => searchQuery.trim() && (showSearchDropdown = true)}
						/>

						{#if showSearchDropdown}
							<div class="search-dropdown-results animate-fade-in">
								{#if isSearching}
									<div class="search-loading">กำลังค้นหา...</div>
								{:else if searchResults.length > 0}
									<div class="search-group-title">สมาชิก</div>
									{#each searchResults as sUser}
										<a href="/profile?uid={sUser.id}" class="search-result-item" onclick={() => showSearchDropdown = false}>
											{#if sUser.photoURL}
												<img src={sUser.photoURL} alt="" class="s-res-avatar" />
											{:else}
												<div class="s-res-avatar-placeholder">{(sUser.displayName || 'U').charAt(0)}</div>
											{/if}
											<div class="s-res-info">
												<div class="s-res-name">{sUser.displayName}</div>
												<div class="s-res-role">{sUser.role === 'admin' ? 'PLEARN Admin' : 'สมาชิก'}</div>
											</div>
										</a>
									{/each}
								{:else if searchQuery.trim()}
									<div class="search-no-results">ไม่พบผู้ใช้งานชื่อนี้</div>
								{/if}
							</div>
							
							<!-- Invisible Overlay to close on click outside -->
							<button class="search-overlay" onclick={() => showSearchDropdown = false} aria-label="Close search results"></button>
						{/if}
					</form>
				{/if}
			</div>

			<!-- CENTER NAVIGATION (DESKTOP) -->
			{#if user}
				<div class="nav-center">
					<a href="/" class="nav-icon-link" class:active={$page.url.pathname === '/'} title="หน้าหลัก">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
					</a>
					<a href="/profile" class="nav-icon-link" class:active={$page.url.pathname === '/profile'} title="โปรไฟล์">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
					</a>
					<a href="/settings" class="nav-icon-link" class:active={$page.url.pathname === '/settings'} title="การตั้งค่า">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
					</a>
					{#if userInfo?.role === 'admin'}
						<a href="/admin" class="nav-icon-link" class:active={$page.url.pathname === '/admin'} title="ผู้ดูแลระบบ">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
						</a>
					{/if}
				</div>
			{/if}
			
			<div class="nav-right">
				<button type="button" class="theme-toggle-btn" onclick={toggleTheme} title="เปลี่ยนโหมดสี" aria-label="Toggle Dark Mode">
					{#if $theme === 'dark'}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
					{/if}
				</button>
				{#if user}
					<NotificationDropdown {user} />
					<a href="/profile" class="nav-profile-btn">
						{#if userInfo?.photoURL}
							<img src={userInfo.photoURL} alt="" class="nav-avatar" referrerpolicy="no-referrer" />
						{:else}
							<div class="nav-avatar-placeholder">{(userInfo?.displayName || 'U').charAt(0)}</div>
						{/if}
						<span class="nav-name">{userInfo?.displayName?.split(' ')[0] || 'โปรไฟล์'}</span>
					</a>
				{:else}
					<img src="/logo.png" class="nav-logo-image landing-logo-right" alt="PLEARN Logo" />
				{/if}
			</div>
		</div>
	</header>

	{#if !user}
		<!-- CLASSIC SPLIT LANDING PAGE -->
		<main class="landing-page-wrap">
			<div class="landing-split">
				<!-- Left Branding -->
				<div class="l-brand-side">
					<h1 class="l-logo">PLEARN</h1>
					<h2 class="l-vision">เพลินช่วยคุณร้อยเรียงเรื่องราวและแบ่งปันให้ทุกคนรอบตัวคุณ</h2>
					
					<!-- Real Stats -->
					<div class="l-stats">
						<div class="stat-box">
							<div class="stat-val text-success">
								<span class="pulse-dot"></span> {onlineUsers}
							</div>
							<div class="stat-lbl">ออนไลน์ขณะนี้</div>
						</div>
						<div class="stat-box">
							<div class="stat-val">{totalUsers}</div>
							<div class="stat-lbl">สมาชิกทั้งหมด</div>
						</div>
					</div>

					<button class="why-plearn-btn" onclick={scrollToPromo}>
						ทำไมต้องเพลิน? <span class="arrow-down">▼</span>
					</button>
				</div>

				<!-- Right Auth Card -->
				<div class="l-auth-side">
					<div class="classic-card auth-card">
						<form onsubmit={handleEmailAuth} class="auth-form">
							{#if authError}
								<div class="auth-error">{authError}</div>
							{/if}
							
							{#if isRegistering}
								<input type="text" class="auth-input" placeholder="ชื่อที่ต้องการแสดง" bind:value={displayName} required />
							{/if}
							<input type="email" class="auth-input" placeholder="อีเมล" bind:value={email} required />
							<input type="password" class="auth-input" placeholder="รหัสผ่าน" bind:value={password} required />

							<button type="submit" class="auth-btn btn-primary" disabled={isAuthenticating}>
								{isRegistering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
							</button>

							<div class="auth-links">
								<button type="button" class="text-btn" onclick={() => isRegistering = !isRegistering}>
									{isRegistering ? 'มีบัญชีอยู่แล้วใช่ไหม? เข้าสู่ระบบเลย' : 'ลืมรหัสผ่านใช่หรือไม่?'}
								</button>
								{#if !isRegistering}
									<span class="auth-links-divider">·</span>
									<button type="button" class="text-btn text-success-link" onclick={() => {isRegistering = true; authError = '';}}>
										สร้างบัญชีใหม่
									</button>
								{/if}
							</div>

							<div class="auth-divider"><span>หรือ</span></div>

							<div class="social-auth-grid">
								<button type="button" class="social-btn facebook-btn" onclick={loginWithFacebook} aria-label="Login with Facebook">
									<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6c1.05 0 2.05.2 2.05.2v2.25h-1.16c-1.14 0-1.39.71-1.39 1.48V12h2.5l-.4 3h-2.1v6.8C18.56 20.87 22 16.84 22 12z"/></svg>
								</button>
								<button type="button" class="social-btn google-btn" onclick={loginWithGoogle} aria-label="Login with Google">
									<svg viewBox="0 0 24 24" width="24" height="24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
								</button>
							</div>
						</form>
					</div>
				</div>
			</div>

			<!-- PROMO SECTION: WHY PLEARN? -->
			<div class="promo-wave-top">
				<svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 70C840 80 960 100 1080 110C1200 120 1320 120 1380 120L1440 120V0H1380C1320 0 1200 0 1080 0C960 0 840 0 720 0C600 0 480 0 360 0C240 0 120 0 60 0H0V120Z" fill="var(--color-bg)"/>
				</svg>
			</div>

			<section class="promo-section" bind:this={promoSection}>
				<div class="promo-content">
					<div class="promo-header">
						<span class="sub-title animate-fade-in">WELCOME TO PLEARN</span>
						<h2 class="promo-title">พื้นที่สว่างแห่งใหม่... เพื่อทุกเรื่องราวของคุณ</h2>
						<p class="promo-desc">
							เราเชื่อว่าทุกความเห็นมีค่า และทุกเรื่องราวสมควรได้รับพื้นที่ที่ปลอดภัยและให้เกียรติซึ่งกันและกัน 
							PLEARN ถูกสร้างขึ้นจากความตั้งใจที่จะมอบ "อิสระแบบสร้างสรรค์" ให้กับทุกคนอย่างแท้จริง
						</p>
					</div>

					<div class="video-preview-container" bind:this={videoContainer} class:reveal-up={isVideoVisible}>
						<div class="video-wrapper">
							<video 
								src="/PLEARN_social.mp4" 
								class="promo-video" 
								autoplay 
								muted 
								loop 
								playsinline
								controls
							>
								<track kind="captions">
								เบราว์เซอร์ของคุณไม่รองรับการเล่นวิดีโอ
							</video>
						</div>
					</div>

					<div class="fluid-features-grid" onmousemove={handleSpotlightMove}>
						<!-- 1: Warm Social -->
						<div class="fluid-feature span-12">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="line-icon"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
							<div class="ff-header">
								<h3>สังคมที่อบอุ่น</h3>
								<p>ที่ที่คุณสามารถเป็นตัวเองได้มากที่สุด ในสังคมที่เป็นมิตรและสร้างสรรค์</p>
							</div>
						</div>

						<!-- 2: Safe Space -->
						<div class="fluid-feature span-6">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="line-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
							<h3>พื้นที่ส่วนตัว</h3>
							<p>เลือกตัวตนที่คุณต้องการ ทั้งแบบเปิดเผยหรือไร้ตัวตน (Anonymous) เราดูแลความเป็นส่วนตัวของคุณเป็นอันดับหนึ่ง</p>
						</div>

						<!-- 3: Open to New Things -->
						<div class="fluid-feature span-6">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="line-icon"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
							<h3>เปิดรับสิ่งใหม่</h3>
							<p>พบกับไอเดียและแรงบันดาลใจจากผู้คนหลากหลายที่พร้อมจะแบ่งปัน</p>
						</div>

						<!-- 4: Storytelling Power -->
						<div class="fluid-feature span-4">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="line-icon"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
							<h3>พลังเล่าเรื่อง</h3>
							<p>สร้างสรรค์บทความด้วยเครื่องมือระดับโปร โดดเด่นด้วยเนื้อหา Markdown</p>
						</div>

						<!-- 5: Polls -->
						<div class="fluid-feature span-4">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="line-icon"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
							<h3>ฟังความรู้สึก</h3>
							<p>เปิดรับความคิดเห็นด้วยโพลอัจฉริยะแบบ Real-time ให้เชื่อมต่อได้ลึกซึ้งขึ้น</p>
						</div>

						<!-- 6: Discover -->
						<div class="fluid-feature span-4">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="line-icon"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
							<h3>การค้นพบ</h3>
							<p>ไม่ใช่แค่ค้นหาหา แต่คือการพบเจอเพื่อนใหม่และแรงบันดาลใจที่ไม่สิ้นสุด</p>
						</div>
					</div>

					<div class="back-to-top-wrap">
						<button class="enjoy-btn" onclick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
							กลับขึ้นไปด้านบนเพื่อเพลิดเพลิน <span class="e-icon">✨</span>
						</button>
					</div>
				</div>
			</section>
		</main>
	{:else}
		<!-- CLASSIC APP LAYOUT -->
		<div class="app-layout">
			<aside class="left-sidebar">
				<div class="stats-widget premium-card">
					<div class="stats-header">
						<span class="stats-title">สถานะชุมชน</span>
						<div class="live-indicator">
							<span class="pulse-dot-small"></span>
							LIVE
						</div>
					</div>
					
					<div class="stats-grid-row">
						<div class="stats-item">
							<div class="stats-icon-wrap bg-green">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
									<circle cx="9" cy="7" r="4"/>
									<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
									<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
								</svg>
							</div>
							<div class="stats-info">
								<span class="stats-value">{onlineUsers}</span>
								<span class="stats-label">ออนไลน์</span>
							</div>
						</div>

						<div class="stats-item">
							<div class="stats-icon-wrap bg-orange">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
								</svg>
							</div>
							<div class="stats-info">
								<span class="stats-value">{postsToday}</span>
								<span class="stats-label">โพสต์วันนี้</span>
							</div>
						</div>
					</div>

					<div class="stats-footer">
						<div class="progress-container">
							<div class="progress-bar" style="width: 65%"></div>
						</div>
						<p class="stats-hint">ชุมชนวันนี้มีการเคลื่อนไหวเพิ่มขึ้น!</p>
					</div>
				</div>

				<div class="sidebar-placeholder">
					<p class="placeholder-text">ฟีเจอร์ใหม่กำลังมา...</p>
				</div>
			</aside>

			<main class="main-content">
				{@render children()}
			</main>

			<aside class="right-sidebar">
				<GlobalChat />
			</aside>

			<nav class="bottom-nav">
				<a href="/" class="b-nav-item" class:active={$page.url.pathname === '/'}>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
					<span class="b-nav-label">หน้าหลัก</span>
				</a>
				<a href="/chat" class="b-nav-item" class:active={$page.url.pathname === '/chat'}>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
					<span class="b-nav-label">แชทต้มยำ</span>
				</a>
				<a href="/profile" class="b-nav-item" class:active={$page.url.pathname === '/profile'}>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
					<span class="b-nav-label">โปรไฟล์</span>
				</a>
				<a href="/settings" class="b-nav-item" class:active={$page.url.pathname === '/settings'}>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
					<span class="b-nav-label">ตั้งค่า</span>
				</a>
				{#if userInfo?.role === 'admin'}
					<a href="/admin" class="b-nav-item" class:active={$page.url.pathname === '/admin'}>
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
						<span class="b-nav-label">Admin</span>
					</a>
				{/if}
			</nav>
		</div>
	{/if}
{/if}

<Toast />

{#if userInfo && userInfo.isSetupComplete === false}
	<div class="onboarding-modal-overlay">
		<form class="onboarding-modal classic-card" onsubmit={handleCompleteSetup}>
			<div class="ob-icon">👋</div>
			<h2 class="ob-title">ขอต้อนรับสู่ PLEARN</h2>
			<p class="ob-desc">ก่อนจะไปเริ่มใช้งาน กรุณาตั้งชื่อที่คุณต้องการให้แสดงในชุมชนนี้ (คุณสามารถเปลี่ยนชื่อใหม่ได้ตลอดในหน้าตั้งค่า)</p>
			
			<div class="ob-input-group">
				<label for="ob-name">ชื่อที่แสดง (Display Name)</label>
				<input type="text" id="ob-name" bind:value={onboardingName} class="auth-input" required placeholder="ชื่อของคุณ..." />
			</div>

			<button type="submit" class="auth-btn btn-primary" disabled={isSavingOnboarding}>
				{isSavingOnboarding ? 'กำลังบันทึก...' : 'เข้าสู่ PLEARN เลย!'}
			</button>
		</form>
	</div>
{/if}

<style>
	/* ============================================
	   PLEARN World-Class UI — Layout Styles
	   Apple HIG / Google Material inspired
	   ============================================ */

	.loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--color-bg); }
	.spinner { width: 32px; height: 32px; border: 2.5px solid var(--color-border-light); border-top-color: var(--color-primary); border-radius: 50%; animation: spin .7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Top Navigation ── */
	.top-nav {
		position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
		background-color: var(--color-nav-bg);
		box-shadow: var(--shadow-nav);
		height: 52px;
	}
	.nav-container {
		display: flex; justify-content: space-between; align-items: center;
		max-width: 1440px; padding: 0 16px; height: 100%; margin: 0 auto;
	}
	.nav-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
	.nav-right { display: flex; align-items: center; gap: 8px; flex: 1; justify-content: flex-end; }

	/* ── Brand ── */
	.nav-brand-group {
		display: flex; align-items: center; gap: 8px;
		text-decoration: none; flex-shrink: 0;
		transition: opacity 0.15s var(--ease-out);
	}
	.nav-brand-group:hover { opacity: 0.8; }
	.nav-brand-text {
		font-size: 17px; font-weight: 800; color: var(--color-primary);
		letter-spacing: -0.04em; display: block;
	}

	.nav-logo-image { width: 32px; height: 32px; object-fit: contain; }
	.theme-toggle-btn {
		width: 36px; height: 36px; border-radius: 50%; border: none; background: transparent;
		color: var(--color-text-muted); display: flex; align-items: center; justify-content: center;
		cursor: pointer; transition: all 0.2s; flex-shrink: 0; margin-right: 4px;
	}
	.theme-toggle-btn:hover { background: var(--color-bg-hover); color: var(--color-text); }

	/* ── Search ── */
	.nav-search {
		display: flex; align-items: center;
		background: var(--color-bg-input);
		border-radius: var(--radius-full); padding: 0 12px; gap: 8px;
		height: 36px; width: 36px;
		transition: width 0.35s var(--ease-out), background 0.2s, box-shadow 0.2s;
		overflow: hidden; cursor: pointer; flex-shrink: 0;
		border: 1.5px solid transparent;
	}
	.nav-search:focus-within {
		width: 220px;
		background: var(--color-bg-card);
		border-color: var(--color-border);
		box-shadow: var(--shadow-card);
	}
	@media (min-width: 1200px) { .nav-search:focus-within { width: 280px; } }

	.search-icon { color: var(--color-text-muted); flex-shrink: 0; transition: color 0.15s; }
	.nav-search:focus-within .search-icon { color: var(--color-text-secondary); }
	.nav-search input {
		border: none; background: transparent; color: var(--color-text);
		outline: none; width: 100%; font-size: 14px;
		opacity: 0; transition: opacity 0.15s;
	}
	.nav-search:focus-within input { opacity: 1; }
	.nav-search input::placeholder { color: var(--color-text-muted); }

	/* ── Center Nav (Desktop) ── */
	.nav-center {
		position: absolute; left: 50%; transform: translateX(-50%);
		display: none; align-items: center; gap: 4px;
		z-index: 10;
	}
	@media (min-width: 850px) { .nav-center { display: flex; } }

	.nav-icon-link {
		width: 44px; height: 44px; border-radius: var(--radius-md);
		display: flex; align-items: center; justify-content: center;
		color: var(--color-text-muted);
		transition: all 0.15s var(--ease-out);
		position: relative;
	}
	.nav-icon-link svg { width: 22px; height: 22px; stroke-width: 1.8; }
	.nav-icon-link:hover { background-color: var(--color-bg-hover); color: var(--color-text); }
	.nav-icon-link.active { color: var(--color-primary); }
	.nav-icon-link.active::after {
		content: ''; position: absolute; bottom: 0; left: 25%; right: 25%;
		height: 2px; background: var(--color-primary); border-radius: 2px 2px 0 0;
	}

	/* ── Profile Button ── */
	.nav-profile-btn {
		display: flex; align-items: center; gap: 8px;
		padding: 4px 8px 4px 4px; border-radius: var(--radius-full);
		text-decoration: none; color: var(--color-text);
		transition: background-color 0.15s var(--ease-out);
		font-weight: 600; font-size: 14px;
	}
	.nav-profile-btn:hover { background-color: var(--color-bg-hover); }
	.nav-avatar, .nav-avatar-placeholder { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
	.nav-avatar-placeholder {
		background: var(--color-primary); color: white;
		display: flex; align-items: center; justify-content: center;
		font-weight: 700; font-size: 12px;
	}
	.nav-name { display: none; }
	@media (min-width: 768px) { .nav-name { display: block; } }

	/* ============================================
	   Landing Page (Guest)
	   ============================================ */
	.landing-page-wrap {
		display: flex; flex-direction: column;
		min-height: calc(100vh - 52px); background: var(--color-bg);
		overflow-x: hidden;
	}
	.landing-split {
		display: flex; align-items: center; justify-content: space-between;
		max-width: 980px; width: 100%; gap: 48px;
		margin: 0 auto; padding: 64px 24px;
	}

	.l-brand-side { flex: 1; padding-right: 32px; }
	.l-logo {
		font-size: 48px; font-weight: 800; color: var(--color-primary);
		letter-spacing: -0.04em; margin-bottom: 12px; line-height: 1;
	}
	.l-vision {
		font-size: 24px; font-weight: 400; line-height: 1.4;
		color: var(--color-text-secondary); margin-bottom: 24px;
		font-family: var(--font-thai);
	}

	.why-plearn-btn {
		background: none; border: none; color: var(--color-text-muted);
		font-weight: 600; font-size: 14px; cursor: pointer;
		display: inline-flex; align-items: center; gap: 6px;
		margin-top: 24px; padding: 8px 0;
		transition: color 0.2s var(--ease-out);
	}
	.why-plearn-btn:hover { color: var(--color-primary); }
	.arrow-down { font-size: 10px; }

	.l-stats { display: flex; gap: 12px; margin-top: 20px; }
	.stat-box {
		background: var(--color-bg-card); padding: 16px 20px;
		border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
	}
	.stat-val {
		font-size: 24px; font-weight: 800;
		display: flex; align-items: center; gap: 8px; line-height: 1;
	}
	.text-success { color: var(--color-success); }
	.pulse-dot {
		width: 8px; height: 8px; background-color: var(--color-success);
		border-radius: 50%; animation: pulse 2s infinite;
	}
	@keyframes pulse {
		0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); }
		70% { box-shadow: 0 0 0 8px rgba(52, 199, 89, 0); }
		100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
	}
	.stat-lbl { font-size: 12px; color: var(--color-text-muted); margin-top: 4px; font-weight: 500; }

	/* ── Auth Card ── */
	.l-auth-side { width: 380px; flex-shrink: 0; }
	.auth-card {
		padding: 24px 0; width: 100%;
		box-shadow: var(--shadow-elevated);
		border-radius: var(--radius-xl);
	}
	.auth-form { display: flex; flex-direction: column; gap: 12px; padding: 0 24px; }

	.auth-error {
		background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.3);
		color: var(--color-danger); padding: 12px; border-radius: var(--radius-md);
		font-size: 13px; text-align: center; font-weight: 500;
	}

	.auth-input {
		width: 100%; padding: 12px 16px; font-size: 15px;
		border: 1.5px solid var(--color-border); border-radius: var(--radius-md);
		background: var(--color-bg-input); color: var(--color-text); outline: none;
		transition: border-color 0.2s, box-shadow 0.2s;
	}
	.auth-input::placeholder { color: var(--color-text-muted); }
	.auth-input:focus {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px var(--color-primary-soft);
	}

	.auth-btn {
		width: 100%; padding: 12px; font-size: 16px; font-weight: 700;
		border-radius: var(--radius-md); border: none; cursor: pointer;
		transition: all 0.15s var(--ease-out);
	}
	.auth-btn:active { transform: scale(0.98); }

	.auth-links {
		display: flex; justify-content: center; align-items: center;
		gap: 8px; margin-top: 8px; flex-wrap: wrap;
	}
	.text-btn {
		color: var(--color-primary); background: none; border: none;
		font-size: 13px; cursor: pointer; text-decoration: none; font-weight: 500;
	}
	.text-btn:hover { text-decoration: underline; }
	.auth-links-divider { color: var(--color-border); font-size: 13px; }
	.text-success-link { color: var(--color-success) !important; font-weight: 600; }

	.auth-divider {
		border-bottom: 1px solid var(--color-border-light);
		position: relative; margin: 16px 0; text-align: center;
	}
	.auth-divider span {
		background: var(--color-bg-card); padding: 0 12px;
		position: relative; top: 10px;
		color: var(--color-text-muted); font-size: 12px; font-weight: 500;
	}

	.social-auth-grid { display: flex; gap: 8px; justify-content: center; }
	.social-btn {
		height: 44px; flex: 1; border-radius: var(--radius-md); border: none;
		cursor: pointer; display: flex; align-items: center; justify-content: center;
		transition: all 0.15s var(--ease-out);
	}
	.social-btn:hover { opacity: 0.85; }
	.social-btn:active { transform: scale(0.97); }
	.facebook-btn { background-color: #1877F2; color: white; }
	.google-btn { background-color: var(--color-bg-input); border: 1.5px solid var(--color-border); }

	/* ── Promo Section ── */
	.promo-wave-top { width: 100%; line-height: 0; margin-top: 64px; margin-bottom: -1px; }
	.promo-wave-top svg { width: 100%; height: auto; display: block; }

	/* ── Onboarding ── */
	.onboarding-modal-overlay {
		position: fixed; top: 0; left: 0; right: 0; bottom: 0;
		background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
		display: flex; align-items: center; justify-content: center;
		z-index: 9999; padding: 24px;
	}
	.onboarding-modal {
		width: 100%; max-width: 420px; padding: 32px 24px;
		display: flex; flex-direction: column; text-align: center;
		animation: slideDown 0.4s var(--ease-out);
	}
	.ob-icon { font-size: 48px; margin-bottom: 12px; line-height: 1; }
	.ob-title { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: var(--color-text); }
	.ob-desc { font-size: 14px; color: var(--color-text-muted); margin-bottom: 24px; line-height: 1.5; }
	.ob-input-group { text-align: left; margin-bottom: 24px; }
	.ob-input-group label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; }

	.promo-section {
		background: var(--color-bg-card);
		padding: 48px 24px 120px;
		position: relative;
	}
	.promo-content { max-width: 720px; margin: 0 auto; text-align: center; }
	.promo-header { margin: 0 auto 48px; }
	.sub-title {
		color: var(--color-primary); font-weight: 700; font-size: 12px;
		letter-spacing: 0.12em; display: block; margin-bottom: 12px;
		text-transform: uppercase;
	}
	.promo-title {
		font-size: 34px; font-weight: 800; color: var(--color-text);
		margin-bottom: 16px; line-height: 1.2; letter-spacing: -0.02em;
	}
	.promo-desc {
		font-size: 17px; color: var(--color-text-secondary);
		line-height: 1.65; max-width: 560px; margin: 0 auto;
	}

	/* ── Video Preview ── */
	.video-preview-container {
		width: 100%; max-width: 720px; margin: 0 auto 64px;
		border-radius: var(--radius-xl); overflow: hidden;
		box-shadow: var(--shadow-elevated);
		background: var(--color-bg-card);
		opacity: 0; transform: translateY(40px);
		transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.video-preview-container.reveal-up {
		opacity: 1; transform: translateY(0);
	}
	.video-wrapper { width: 100%; aspect-ratio: 16 / 9; background: #000; }
	.promo-video { width: 100%; height: 100%; object-fit: cover; display: block; }

	/* ── Feature Grid ── */
	.fluid-features-grid {
		display: grid; grid-template-columns: repeat(12, 1fr);
		gap: 48px 32px; margin-top: 64px; text-align: left;
		max-width: 720px; margin-left: auto; margin-right: auto;
	}
	/* No mouse spotlight — removed for cleaner look */
	.fluid-features-grid::before { display: none; }

	.fluid-feature {
		position: relative; display: flex; flex-direction: column;
		transition: transform 0.3s var(--ease-out);
	}
	.fluid-feature:hover { transform: translateY(-4px); }

	.fluid-feature.span-6 { grid-column: span 6; }
	.fluid-feature.span-4 { grid-column: span 4; }
	.fluid-feature.span-8 { grid-column: span 8; }
	.fluid-feature.span-12 {
		grid-column: span 12; display: flex;
		flex-direction: row; align-items: flex-start; gap: 32px;
	}

	.line-icon {
		width: 32px; height: 32px; color: var(--color-primary);
		margin-bottom: 16px; stroke-width: 1.5; flex-shrink: 0;
		transition: transform 0.3s var(--ease-out);
	}
	.fluid-feature:hover .line-icon { transform: scale(1.1); }

	.ff-header { display: flex; flex-direction: column; }

	.fluid-feature h3 {
		font-size: 20px; font-weight: 700; color: var(--color-text);
		margin-bottom: 8px; letter-spacing: -0.02em; line-height: 1.3;
	}
	.fluid-feature.span-12 h3, .fluid-feature.span-8 h3 { font-size: 24px; }

	.fluid-feature p {
		color: var(--color-text-secondary); line-height: 1.6;
		font-size: 15px; font-weight: 400;
	}

	/* ── Back to Top ── */
	.back-to-top-wrap { margin-top: 80px; display: flex; justify-content: center; }
	.enjoy-btn {
		background: none; border: none; color: var(--color-text-muted);
		font-weight: 600; font-size: 14px; cursor: pointer;
		display: inline-flex; align-items: center; gap: 8px;
		padding: 12px 24px; border-radius: var(--radius-full);
		transition: all 0.2s var(--ease-out);
	}
	.enjoy-btn:hover { color: var(--color-primary); background: var(--color-primary-soft); }
	.e-icon { font-size: 16px; }

	@media (max-width: 900px) {
		.fluid-feature.span-6, .fluid-feature.span-4, .fluid-feature.span-8,
		.fluid-feature.span-12 { grid-column: span 12; flex-direction: column; gap: 16px; }
		.promo-title { font-size: 28px; }
	}

	/* ============================================
	   App Layout (Authenticated)
	   ============================================ */
	.app-layout {
		display: flex; align-items: flex-start;
		max-width: 1440px; margin: 0 auto;
		min-height: calc(100vh - 52px); padding-top: 52px;
	}
	.left-sidebar {
		width: 280px; padding: 16px 12px;
		position: sticky; top: 52px;
		height: calc(100vh - 52px); overflow-y: auto;
	}
	.right-sidebar {
		width: 320px; padding: 16px;
		display: none; position: sticky; top: 52px;
		height: calc(100vh - 52px); overflow-y: auto;
	}
	@media (min-width: 1100px) { .right-sidebar { display: block; } }

	/* ── Sidebar Nav ── */
	.side-nav { display: flex; flex-direction: column; gap: 2px; }
	.nav-link {
		display: flex; align-items: center; gap: 12px;
		padding: 10px 12px; border-radius: var(--radius-md);
		color: var(--color-text); text-decoration: none;
		font-weight: 500; font-size: 14px;
		transition: background-color 0.15s var(--ease-out);
	}
	.nav-link:hover { background-color: var(--color-bg-hover); }
	.nav-link.active { background-color: var(--color-primary-soft); color: var(--color-primary); font-weight: 600; }

	/* ── Community Stats Widget ── */
	.stats-widget {
		background: var(--color-bg-card);
		border-radius: var(--radius-lg); padding: 20px;
		box-shadow: var(--shadow-card); margin-bottom: 12px;
		position: relative; overflow: hidden;
	}
	.stats-widget::before {
		content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
		background: linear-gradient(90deg, var(--color-primary), #FF8A65);
	}
	.stats-header {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: 16px;
	}
	.stats-title {
		font-size: 11px; font-weight: 700; color: var(--color-text-muted);
		text-transform: uppercase; letter-spacing: 0.06em;
	}
	.live-indicator {
		display: flex; align-items: center; gap: 6px;
		font-size: 10px; font-weight: 700; color: var(--color-success);
		text-transform: uppercase; letter-spacing: 0.04em;
	}
	.pulse-dot-small {
		width: 6px; height: 6px; background: var(--color-success);
		border-radius: 50%; animation: pulse-small 2s infinite;
	}
	@keyframes pulse-small {
		0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); }
		70% { box-shadow: 0 0 0 5px rgba(52, 199, 89, 0); }
		100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
	}

	.stats-grid-row { display: flex; flex-direction: column; gap: 12px; }
	.stats-item { display: flex; align-items: center; gap: 12px; }
	.stats-icon-wrap {
		width: 36px; height: 36px; border-radius: var(--radius-md);
		display: flex; align-items: center; justify-content: center;
	}
	.bg-green { background: rgba(52, 199, 89, 0.1); color: var(--color-success); }
	.bg-orange { background: var(--color-primary-soft); color: var(--color-primary); }
	.stats-info { display: flex; flex-direction: column; }
	.stats-value { font-size: 20px; font-weight: 800; color: var(--color-text); line-height: 1; }
	.stats-label { font-size: 11px; color: var(--color-text-muted); font-weight: 500; margin-top: 2px; }

	.stats-footer {
		margin-top: 16px; padding-top: 12px;
		border-top: 1px solid var(--color-border-light);
	}
	.progress-container {
		height: 4px; background: var(--color-bg-input);
		border-radius: var(--radius-full); overflow: hidden; margin-bottom: 8px;
	}
	.progress-bar {
		height: 100%; background: var(--color-primary);
		border-radius: var(--radius-full); transition: width 0.8s var(--ease-out);
	}
	.stats-hint { font-size: 11px; color: var(--color-text-muted); font-weight: 400; }

	.sidebar-placeholder {
		padding: 24px; border-radius: var(--radius-lg);
		color: var(--color-text-muted); text-align: center;
	}

	.main-content { flex: 1; min-width: 0; padding: 16px 0; display: flex; justify-content: center; }

	/* ── Bottom Nav (Mobile) ── */
	.bottom-nav { display: none; }

	@media (max-width: 900px) {
		.landing-page-wrap { padding: 24px 16px; }
		.landing-split { flex-direction: column; text-align: center; align-items: center; gap: 32px; }
		.l-brand-side { padding-right: 0; width: 100%; display: flex; flex-direction: column; align-items: center; }
		.l-auth-side { width: 100%; max-width: 380px; }
		.l-vision { font-size: 20px; }
		.l-stats { justify-content: center; width: 100%; }
		.nav-search { display: none; }
	}

	@media (max-width: 800px) {
		.left-sidebar { display: none; }
		.main-content { padding-bottom: 72px; }
		.bottom-nav {
			display: flex; justify-content: space-around; align-items: center;
			position: fixed; bottom: 0; left: 0; right: 0;
			height: 49px; background-color: var(--color-nav-bg);
			box-shadow: 0 -1px 0 var(--color-border-light); z-index: 50;
		}
		.b-nav-item {
			display: flex; flex-direction: column; align-items: center; justify-content: center;
			width: 100%; height: 100%; color: var(--color-text-muted);
			text-decoration: none; gap: 2px;
			transition: color 0.15s var(--ease-out);
		}
		.b-nav-item svg { width: 22px; height: 22px; stroke-width: 1.8; }
		.b-nav-label { font-size: 10px; font-weight: 500; }
		.b-nav-item.active { color: var(--color-primary); }
		.b-nav-item.active .b-nav-label { font-weight: 600; }
	}

	/* ── Search Dropdown ── */
	.nav-search { position: relative; }
	.search-dropdown-results {
		position: absolute; top: calc(100% + 4px); left: 0; right: 0;
		background: var(--color-bg-card); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-elevated); overflow: hidden;
		z-index: 1000; max-height: 360px; overflow-y: auto;
		min-width: 280px;
	}
	.search-group-title {
		padding: 8px 16px; font-size: 11px; font-weight: 600;
		color: var(--color-text-muted); text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.search-result-item {
		display: flex; align-items: center; gap: 12px; padding: 10px 16px;
		text-decoration: none; color: var(--color-text);
		transition: background 0.12s var(--ease-out);
	}
	.search-result-item:hover { background-color: var(--color-bg-hover); }

	.s-res-avatar, .s-res-avatar-placeholder {
		width: 36px; height: 36px; border-radius: 50%;
		object-fit: cover; flex-shrink: 0;
	}
	.s-res-avatar-placeholder {
		background: var(--color-bg-input); color: var(--color-text-secondary);
		display: flex; align-items: center; justify-content: center;
		font-weight: 600; font-size: 14px;
	}

	.s-res-info { display: flex; flex-direction: column; gap: 1px; }
	.s-res-name { font-weight: 600; font-size: 14px; line-height: 1.2; }
	.s-res-role { font-size: 12px; color: var(--color-text-muted); }

	.search-loading, .search-no-results {
		padding: 24px; text-align: center;
		color: var(--color-text-muted); font-size: 13px;
	}

	.search-overlay {
		position: fixed; inset: 0; background: transparent;
		z-index: 999; border: none; cursor: default;
	}
</style>
