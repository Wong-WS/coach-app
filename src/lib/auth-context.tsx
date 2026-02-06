'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
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
        startTime: '09:00',
        endTime: '17:00',
      });
    }
  };

  const signOut = async () => {
    if (!auth) throw new Error('Firebase not initialized');
    await firebaseSignOut(auth);
    setCoach(null);
  };

  return (
    <AuthContext.Provider value={{ user, coach, loading, signIn, signUp, signOut, refreshCoach }}>
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
