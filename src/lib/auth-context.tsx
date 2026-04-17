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
import { Coach, DayOfWeek, SignupFormData } from '@/types';

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

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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
        slug: data.slug,
        email: data.email,
        serviceType: data.serviceType,
        lessonDurationMinutes: data.lessonDurationMinutes,
        travelBufferMinutes: data.travelBufferMinutes,
        whatsappNumber: data.whatsappNumber,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
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

    // Check if slug is already taken
    const slugDoc = await getDoc(doc(db, 'coachSlugs', data.slug));
    if (slugDoc.exists()) {
      throw new Error('This URL slug is already taken. Please choose another.');
    }

    // Create auth user
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const uid = userCredential.user.uid;

    // Create coach slug lookup
    await setDoc(doc(db, 'coachSlugs', data.slug), {
      coachId: uid,
    });

    // Create coach profile
    await setDoc(doc(db, 'coaches', uid), {
      displayName: data.displayName,
      slug: data.slug,
      email: data.email,
      serviceType: data.serviceType,
      lessonDurationMinutes: 60, // Default
      travelBufferMinutes: 30,   // Default
      whatsappNumber: data.whatsappNumber,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create default working hours (Mon-Fri 9am-5pm, weekends off)
    for (const day of DAYS) {
      const isWeekday = !['saturday', 'sunday'].includes(day);
      await setDoc(doc(db, 'coaches', uid, 'workingHours', day), {
        enabled: isWeekday,
        timeRanges: [{ startTime: '09:00', endTime: '17:00' }],
      });
    }
  };

  const signInWithGoogle = async () => {
    if (!auth || !db) throw new Error('Firebase not initialized');

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const { uid, displayName, email } = result.user;

    const coachRef = doc(db, 'coaches', uid);
    const existing = await getDoc(coachRef);
    if (existing.exists()) return;

    const baseSlug = (displayName || email || 'coach')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'coach';

    let slug = baseSlug;
    for (let i = 1; (await getDoc(doc(db, 'coachSlugs', slug))).exists(); i++) {
      slug = `${baseSlug}-${i}`;
    }

    await setDoc(doc(db, 'coachSlugs', slug), { coachId: uid });
    await setDoc(coachRef, {
      displayName: displayName || email?.split('@')[0] || 'Coach',
      slug,
      email: email || '',
      serviceType: 'Swimming Coach',
      lessonDurationMinutes: 60,
      travelBufferMinutes: 30,
      whatsappNumber: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const day of DAYS) {
      const isWeekday = !['saturday', 'sunday'].includes(day);
      await setDoc(doc(db, 'coaches', uid, 'workingHours', day), {
        enabled: isWeekday,
        timeRanges: [{ startTime: '09:00', endTime: '17:00' }],
      });
    }

    // onAuthStateChanged may have already run a coach fetch before the doc existed —
    // hydrate the context now so the dashboard sees a real coach on first render.
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
