# MEMORY.md - Long-Term Memory

## Context
- Finalizing UI for PLEARN Social Platform.
- Previous session: Refined logo to circular "P", added landing page features, fixed navigation.
- Latest session (2026-04-13): Implemented PWA Support (Service Worker, Manifest) + Admin Analytics Dashboard (`/admin`).

## Features Added (2026-04-13)
- **PWA Support**: Added `manifest.json`, service-worker.js using SvelteKit `$service-worker` for offline asset caching, and Apple touch meta tags in `app.html` for standalone mobile experience.
- **Admin Post Analytics**: Created `/admin` route explicitly for users with `role: 'admin'`. Features a custom CSS bar chart for past 7 days' posts, Top 5 posts by reactions leaderboard, and online/active users status check. Added shortcut links to layout navigation.

## Lessons Learned
- Users might prefer brand identity over extreme minimalism (circular icon only).
- Keeping the circular icon for aesthetic while including the brand name is a good compromise.
- For Firestore pagination: onSnapshot for first batch (real-time) + getDocs with startAfter for older batches. Deduplicate using Set of IDs.
- Using simple CSS bar charts is robust enough for basic dashboards and removes the need for heavy charting libraries.
