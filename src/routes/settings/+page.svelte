<script>
	import { theme, toggleTheme } from '$lib/stores/theme';
	import { fontType, setFont } from '$lib/stores/font';
	import { currentUser, userData, logout } from '$lib/stores/auth';
	
	let currentTheme = $state('light');
	const unsubTheme = theme.subscribe(v => currentTheme = v);

	let currentFont = $state('modern');
	const unsubFont = fontType.subscribe(v => currentFont = v);
</script>

<svelte:head>
	<title>การตั้งค่า | PLEARN</title>
</svelte:head>

<div class="settings-page">
	<h1 class="page-title">การตั้งค่า</h1>
	<p class="page-subtitle">จัดการบัญชีและปรับแต่งประสบการณ์ของคุณ</p>

	<div class="settings-section classic-card">
		<h2 class="section-title">การตั้งค่าหน้าจอ</h2>
		<div class="setting-item">
			<div class="setting-info">
				<span class="setting-label">โหมดมืด (Dark Mode)</span>
				<span class="setting-desc">ปรับเปลี่ยนธีมของแอปพลิเคชันให้สบายตาในที่แสงน้อย</span>
			</div>
			<label class="switch">
				<input type="checkbox" checked={currentTheme === 'dark'} onchange={toggleTheme}>
				<span class="slider"></span>
			</label>
		</div>
	</div>

	<div class="settings-section classic-card">
		<h2 class="section-title">รูปแบบตัวอักษร</h2>
		<div class="setting-item">
			<div class="setting-info">
				<span class="setting-label">รูปแบบฟอนต์ในแอปพลิเคชัน</span>
				<span class="setting-desc">เลือกผสมฟอนต์ทางการสำหรับบทความ และฟอนต์โมเดิร์นสำหรับเมนูต่างๆ เพื่อความสวยงามและอ่านง่าย</span>
			</div>
			<div class="font-toggle-group">
				<button 
					type="button"
					class="font-btn {currentFont === 'mixed' ? 'active' : ''}" 
					onclick={() => setFont('mixed')}
				>
					ผสม (แนะนำ)
				</button>
				<button 
					type="button"
					class="font-btn {currentFont === 'modern' ? 'active' : ''}" 
					onclick={() => setFont('modern')}
				>
					โมเดิร์นล้วน
				</button>
				<button 
					type="button"
					class="font-btn {currentFont === 'formal' ? 'active' : ''}" 
					onclick={() => setFont('formal')}
				>
					ทางการล้วน
				</button>
			</div>
		</div>
	</div>

	<div class="settings-section classic-card">
		<h2 class="section-title">บัญชีและการรักษาความปลอดภัย</h2>
		<div class="setting-item">
			<div class="setting-info">
				<span class="setting-label">อีเมลที่เชื่อมต่อ</span>
				<span class="setting-desc">{$userData?.email || 'กำลังโหลด...'}</span>
			</div>
		</div>
		<div class="setting-item danger-zone">
			<button class="classic-btn btn-secondary w-full text-danger" onclick={logout}>
				ออกจากระบบ
			</button>
		</div>
	</div>
</div>

<style>
	.settings-page { max-width: 640px; width: 100%; margin: 0 auto; padding: 24px 16px; }
	.page-title { font-size: 24px; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.02em; }
	.page-subtitle { font-size: 14px; color: var(--color-text-muted); margin-bottom: 24px; }

	.settings-section { padding: 0 16px; margin-bottom: 12px; }
	.section-title { font-size: 11px; font-weight: 700; padding: 16px 0 12px; border-bottom: 1px solid var(--color-border-light); margin-bottom: 4px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }

	.setting-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; }
	.setting-item:not(:last-child) { border-bottom: 1px solid var(--color-border-light); }

	.setting-info { display: flex; flex-direction: column; gap: 2px; }
	.setting-label { font-weight: 600; font-size: 15px; }
	.setting-desc { font-size: 12px; color: var(--color-text-muted); }

	.w-full { width: 100%; justify-content: center; }
	.text-danger { color: var(--color-danger) !important; }

	/* iOS-style Toggle */
	.switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
	.switch input { opacity: 0; width: 0; height: 0; }
	.slider {
		position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
		background-color: var(--color-border); transition: all 0.25s var(--ease-out); border-radius: 24px;
	}
	.slider:before {
		position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
		background-color: white; transition: all 0.25s var(--ease-out); border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
	}
	input:checked + .slider { background-color: var(--color-success); }
	input:checked + .slider:before { transform: translateX(20px); }

	/* Segmented Control */
	.font-toggle-group { display: flex; background: var(--color-bg-input); border-radius: var(--radius-md); padding: 3px; }
	.font-btn { padding: 8px 12px; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; border-radius: var(--radius-sm); font-weight: 600; font-size: 13px; transition: all 0.2s var(--ease-out); white-space: nowrap; }
	.font-btn.active { background: var(--color-bg-card); color: var(--color-text); box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
	.font-btn:hover:not(.active) { color: var(--color-text-secondary); }
</style>
