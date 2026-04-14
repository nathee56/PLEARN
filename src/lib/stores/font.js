import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Default to 'mixed' font
const initialFont = browser && localStorage.getItem('font') ? localStorage.getItem('font') : 'mixed';

export const fontType = writable(initialFont);

if (browser) {
	fontType.subscribe((value) => {
		localStorage.setItem('font', value);
		document.documentElement.classList.remove('font-formal', 'font-mixed', 'font-modern');
		document.documentElement.classList.add(`font-${value}`);
	});
}

export function setFont(type) {
	fontType.set(type);
}
