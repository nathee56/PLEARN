// src/lib/firebase.js
// Firebase configuration and initialization
// ⚠️ REPLACE these values with your actual Firebase project config
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
	apiKey: 'AIzaSyD49uP3PKH580onSXwMfJ7IBrz8KU6q1ow',
	authDomain: 'plearn-b53e3.firebaseapp.com',
	projectId: 'plearn-b53e3',
	storageBucket: 'plearn-b53e3.firebasestorage.app',
	messagingSenderId: '552503313765',
	appId: '1:552503313765:web:a79e61a5247304f8134d8c',
	measurementId: 'G-N0X2FHQRXT'
};

// Singleton pattern — prevent re-initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
