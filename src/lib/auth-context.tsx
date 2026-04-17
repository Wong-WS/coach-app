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

  const fetchCoach = async (uid: string): Promise<Coach | null> => {
    if (!db) return null;
    const coachDoc = await getDoc(doc(db, 'coaches', uid));
    if (coachDoc.exists()) {
      const data = coachDoc.data();
      return {
        id: coachDoc.id,
        displayName: data.displayName,
      };
    }
    return null;
  };

  const refreshCoach = async () => {
    if (user) {
      const coachData = await fetchCoach(user.uid);
      setCoach(coachData);
    }
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const coachData = await fetchCoach(user.uid);
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
    if (!auth || !db) throw new Error('Firebase not initialized');

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const { uid, displayName, email } = result.user;

    const coachRef = doc(db, 'coaches', uid);
    const existing = await getDoc(coachRef);
    if (existing.exists()) return;

    await setDoc(coachRef, {
      displayName: displayName || email?.split('@')[0] || 'Coach',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const created = await fetchCoach(uid);
    setCoach(created);
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
