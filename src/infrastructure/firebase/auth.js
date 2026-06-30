import { auth } from '@/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';

export { auth, onAuthStateChanged };

export const getCurrentUser = () => auth.currentUser;
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOut = () => firebaseSignOut(auth);
export const logout = signOut;
