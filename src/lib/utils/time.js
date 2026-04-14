// src/lib/utils/time.js
// Thai relative time formatter

/**
 * Convert Firestore timestamp to Thai relative time string
 * @param {any} timestamp - Firestore Timestamp or Date object
 * @returns {string} Thai relative time (e.g., "เมื่อ 5 นาทีที่แล้ว")
 */
export function getRelativeTime(timestamp) {
	if (!timestamp) return '';

	const now = Date.now();
	let date;

	// Handle Firestore Timestamp
	if (timestamp?.toDate) {
		date = timestamp.toDate();
	} else if (timestamp instanceof Date) {
		date = timestamp;
	} else if (typeof timestamp === 'number') {
		date = new Date(timestamp);
	} else {
		return '';
	}

	const diffMs = now - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	const diffWeek = Math.floor(diffDay / 7);
	const diffMonth = Math.floor(diffDay / 30);

	if (diffSec < 30) return 'เมื่อสักครู่';
	if (diffSec < 60) return `เมื่อ ${diffSec} วินาทีที่แล้ว`;
	if (diffMin === 1) return 'เมื่อ 1 นาทีที่แล้ว';
	if (diffMin < 60) return `เมื่อ ${diffMin} นาทีที่แล้ว`;
	if (diffHour === 1) return 'เมื่อ 1 ชั่วโมงที่แล้ว';
	if (diffHour < 24) return `เมื่อ ${diffHour} ชั่วโมงที่แล้ว`;
	if (diffDay === 1) return 'เมื่อวานนี้';
	if (diffDay < 7) return `เมื่อ ${diffDay} วันที่แล้ว`;
	if (diffWeek === 1) return 'เมื่อสัปดาห์ที่แล้ว';
	if (diffWeek < 4) return `เมื่อ ${diffWeek} สัปดาห์ที่แล้ว`;
	if (diffMonth === 1) return 'เมื่อเดือนที่แล้ว';
	if (diffMonth < 12) return `เมื่อ ${diffMonth} เดือนที่แล้ว`;

	// Fallback: show date
	return date.toLocaleDateString('th-TH', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}
