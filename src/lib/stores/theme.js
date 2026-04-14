// src/lib/stores/theme.js
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const defaultValue = 'light';
const initialValue = browser ? window.localStorage.getItem('theme') ?? defaultValue : defaultValue;

export const theme = writable(initialValue);

if (browser) {
	theme.subscribe((value) => {
		window.localStorage.setItem('theme', value);
		if (value === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});
}

export function toggleTheme() {
	theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}
