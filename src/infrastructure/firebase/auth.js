import { auth } from '@/firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from 'firebase/auth';

export { auth, onAuthStateChanged };

export const getCurrentUser = () => auth.currentUser;
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const register = async ({ email, password, fullName }) => {
  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  const displayName = fullName?.trim();

  if (displayName) {
    await updateProfile(credentials.user, { displayName });
  }

  return credentials;
};
export const signOut = () => firebaseSignOut(auth);
export const logout = signOut;
