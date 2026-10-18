'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
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
import { withTimeout } from './with-timeout';
import { Coach, SignupFormData } from '@/types';

/**
 * How long to wait for the coach profile before showing the retry banner.
 * Generous for a single document read — this is a stall detector, not a
 * latency budget.
 */
const COACH_LOAD_TIMEOUT_MS = 10_000;

interface AuthContextType {
  user: User | null;
  coach: Coach | null;
  /** Auth resolution only — see the note on the listener in AuthProvider. */
  loading: boolean;
  /** The coach profile read failed or stalled; `refreshCoach` retries it. */
  coachFailed: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: SignupFormData) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshCoach: () => Promise<void>;
}

/** Reads the signed-in user's coach profile, creating it on first sign-in. */
async function ensureCoach(user: User): Promise<Coach | null> {
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
  const fallbackName = user.displayName || user.email?.split('@')[0] || 'Coach';
  await setDoc(coachRef, {
    displayName: fallbackName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: user.uid, displayName: fallbackName };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachFailed, setCoachFailed] = useState(false);

  /**
   * Load the coach profile, surfacing failure as state rather than a throw.
   *
   * `coachFailed` is cleared only on success: a retry keeps the banner up and
   * the dashboard rendered instead of dropping the whole screen back to the
   * spinner it just escaped.
   */
  const loadCoach = useCallback(async (u: User) => {
    try {
      const coachData = await withTimeout(ensureCoach(u), COACH_LOAD_TIMEOUT_MS, 'coach profile');
      // ensureCoach returns null only when Firestore isn't configured. That is
      // a failure, not an empty profile — and leaving it as null would park the
      // dashboard's gate on the spinner waiting for a coach that never comes.
      if (!coachData) throw new Error('Firestore is not configured');
      setCoach(coachData);
      setCoachFailed(false);
    } catch (e) {
      console.error('[auth] could not load the coach profile:', e);
      setCoachFailed(true);
    }
  }, []);

  const refreshCoach = async () => {
    if (user) await loadCoach(user);
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      // `loading` means "has Firebase told us whether anyone is signed in" and
      // nothing more. It used to be set after awaiting the coach profile read,
      // which put a Firestore round trip behind the dashboard's full-screen
      // spinner: when that read rejected, the line never ran, and the app sat
      // on a black screen with no error and no way out but a reload.
      setLoading(false);
      if (user) {
        void loadCoach(user);
      } else {
        setCoach(null);
        setCoachFailed(false);
      }
    });

    return () => unsubscribe();
  }, [loadCoach]);

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
    setCoachFailed(false);
  };

  return (
    <AuthContext.Provider value={{ user, coach, loading, coachFailed, signIn, signUp, signInWithGoogle, signOut, refreshCoach }}>
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
