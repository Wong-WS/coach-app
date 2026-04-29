'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Coach, SignupFormData } from '@/types';

interface AuthContextType {
  user: User | null;
  coach: Coach | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: SignupFormData) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshCoach: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureCoach = async (user: User): Promise<Coach | null> => {
    if (!db) return null;
    const coachRef = doc(db, 'coaches', user.uid);
    const coachDoc = await getDoc(coachRef);
    if (coachDoc.exists()) {
      const data = coachDoc.data();
      return {
        id: coachDoc.id,
        displayName: data.displayName,
      };
    }
    const fallbackName =
      user.displayName || user.email?.split('@')[0] || 'Coach';
    await setDoc(coachRef, {
      displayName: fallbackName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: user.uid, displayName: fallbackName };
  };

  const refreshCoach = async () => {
    if (user) {
      const coachData = await ensureCoach(user);
      setCoach(coachData);
    }
  };

  useEffect(() => {
    if (!auth) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate loading=false when Firebase auth isn't configured (dev-only path)
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const coachData = await ensureCoach(user);
        setCoach(coachData);
      } else {
        setCoach(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (data: SignupFormData) => {
    if (!auth || !db) throw new Error('Firebase not initialized');

    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const uid = userCredential.user.uid;

    await setDoc(doc(db, 'coaches', uid), {
      displayName: data.displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not initialized');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (!auth) throw new Error('Firebase not initialized');
    await firebaseSignOut(auth);
    setCoach(null);
  };

  return (
    <AuthContext.Provider value={{ user, coach, loading, signIn, signUp, signInWithGoogle, signOut, refreshCoach }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
