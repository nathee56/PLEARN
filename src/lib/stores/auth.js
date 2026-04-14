import { writable } from 'svelte/store';
import { auth, db, googleProvider } from '$lib/firebase';
import { 
	onAuthStateChanged, signInWithPopup, signOut, 
	signInWithEmailAndPassword, createUserWithEmailAndPassword, 
	FacebookAuthProvider 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/** @type {import('svelte/store').Writable<any>} */
export const currentUser = writable(null);

/** @type {import('svelte/store').Writable<boolean>} */
export const authLoading = writable(true);

/** @type {import('svelte/store').Writable<any>} */
export const userData = writable(null);

const ADMIN_EMAILS = ['raphiphat6987@gmail.com'];
const fbProvider = new FacebookAuthProvider();

let presenceInterval;

/**
 * Initialize auth state listener and presence ping
 */
export function initAuth() {
	return onAuthStateChanged(auth, async (user) => {
		if (user) {
			currentUser.set(user);
			const userRef = doc(db, 'users', user.uid);
			const userSnap = await getDoc(userRef);

			if (!userSnap.exists()) {
				const isAdmin = ADMIN_EMAILS.includes(user.email || '');
				const newUserData = {
					uid: user.uid,
					displayName: user.displayName || 'ผู้ใช้ใหม่',
					photoURL: user.photoURL || '',
					email: user.email || '',
					role: isAdmin ? 'admin' : 'user',
					createdAt: serverTimestamp(),
					lastActive: serverTimestamp()
				};
				await setDoc(userRef, newUserData);
				userData.set(newUserData);
			} else {
				// Update lastActive on login
				await updateDoc(userRef, { lastActive: serverTimestamp() });
				userData.set({ ...userSnap.data(), id: userSnap.id });
			}

			// Ping presence every 1 minute
			if (presenceInterval) clearInterval(presenceInterval);
			presenceInterval = setInterval(async () => {
				try {
					await updateDoc(userRef, { lastActive: serverTimestamp() });
				} catch (e) {
					console.error("Presence ping failed:", e);
				}
			}, 60000);

		} else {
			currentUser.set(null);
			userData.set(null);
			if (presenceInterval) {
				clearInterval(presenceInterval);
				presenceInterval = null;
			}
		}
		authLoading.set(false);
	});
}

/** Auth Methods */
export async function loginWithGoogle() {
	await signInWithPopup(auth, googleProvider);
}

export async function loginWithFacebook() {
	await signInWithPopup(auth, fbProvider);
}

export async function loginWithEmail(email, password) {
	await signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password, displayName) {
	const userCredential = await createUserWithEmailAndPassword(auth, email, password);
	const user = userCredential.user;
	
	const isAdmin = ADMIN_EMAILS.includes(user.email || '');
	const newUserData = {
		uid: user.uid,
		displayName: displayName || user.email.split('@')[0],
		photoURL: '',
		email: user.email || '',
		role: isAdmin ? 'admin' : 'user',
		createdAt: serverTimestamp(),
		lastActive: serverTimestamp()
	};
	
	await setDoc(doc(db, 'users', user.uid), newUserData);
	return user;
}

export async function logout() {
	await signOut(auth);
}
