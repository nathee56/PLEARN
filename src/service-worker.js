/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `plearn-cache-${version}`;

const ASSETS = [
	...build, // the app itself (JS/CSS bundles)
	...files  // everything in `static`
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove previous cached data from disk
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// Ignore non-GET requests
	if (event.request.method !== 'GET') return;

	// Ignore browser extension requests
	const url = new URL(event.request.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	// Don't cache Firebase/API requests
	if (url.hostname.includes('googleapis.com') || 
		url.hostname.includes('firebaseio.com') ||
		url.hostname.includes('firebase') ||
		url.hostname.includes('gstatic.com')) {
		return;
	}

	async function respond() {
		const cache = await caches.open(CACHE);
		
		// `build`/`files` can always be served from the cache
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(url.pathname);
			if (response) return response;
		}

		// For everything else, try the network first, then cache
		try {
			const response = await fetch(event.request);

			// If we got a valid response, clone and cache it
			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch (err) {
			// Fall back to cache
			const response = await cache.match(event.request);

			if (response) {
				return response;
			}

			// If we can't find the page in cache either, show offline message
			throw err;
		}
	}

	event.respondWith(respond());
});
