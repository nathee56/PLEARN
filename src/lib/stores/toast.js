import { writable } from 'svelte/store';

const toasts = writable([]);

let idCounter = 0;

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'success'|'error'|'info'} type - Toast type
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, type = 'success', duration = 3000) {
	const id = ++idCounter;
	toasts.update((t) => [...t, { id, message, type, visible: true }]);

	setTimeout(() => {
		// Start exit animation
		toasts.update((t) =>
			t.map((toast) => (toast.id === id ? { ...toast, visible: false } : toast))
		);
		// Remove from DOM after animation
		setTimeout(() => {
			toasts.update((t) => t.filter((toast) => toast.id !== id));
		}, 300);
	}, duration);
}

export { toasts };
