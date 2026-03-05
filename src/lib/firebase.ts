// Import the necessary Firebase packages
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Firebase configuration
// NOTE: Replace these with your own Firebase project config values
const firebaseConfig = {
  apiKey: "AIzaSyBsLHBhu-66FhLoU9vj92Bcswcevx9bMms",
  authDomain: "huddleai-a812c.firebaseapp.com",
  projectId: "huddleai-a812c",
  storageBucket: "huddleai-a812c.firebasestorage.app",
  messagingSenderId: "785097766884",
  appId: "1:785097766884:web:565f5673335410add1f9f1",
  measurementId: "G-D32VHHW8EG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app; 