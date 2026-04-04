import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { User as AppUser, School } from '../types';

interface AuthContextType {
  user: FirebaseUser | null;
  appUser: AppUser | null;
  school: School | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    console.log('AuthContext: Setting up onAuthStateChanged');
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('AuthContext: onAuthStateChanged fired, user:', firebaseUser?.uid);
      setUser(firebaseUser);
      if (!firebaseUser) {
        console.log('AuthContext: No user, setting loading to false');
        setAppUser(null);
        setSchool(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    // Safety timeout: if loading is still true after 10 seconds, force it to false
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('AuthContext: Safety timeout reached, forcing loading to false');
          return false;
        }
        return prev;
      });
      setIsAuthReady(true);
    }, 10000);

    return () => {
      unsubscribeAuth();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
      console.log('AuthContext: User snapshot exists:', snapshot.exists());
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log('AuthContext: User data:', data);
        setAppUser(data as AppUser);
      } else {
        console.warn('AuthContext: User document NOT found at path:', `users/${user.uid}`);
        setAppUser(null);
      }
      setLoading(false);
      setIsAuthReady(true);
    }, (error) => {
      console.error('AuthContext Firestore Error:', error);
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribeUser();
  }, [user]);

  useEffect(() => {
    if (!appUser?.schoolId) {
      setSchool(null);
      return;
    }

    const schoolDocRef = doc(db, 'schools', appUser.schoolId);
    const unsubscribeSchool = onSnapshot(schoolDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setSchool(snapshot.data() as School);
      } else {
        setSchool(null);
      }
    }, (error) => {
      console.error('AuthContext School Firestore Error:', error);
    });

    return () => unsubscribeSchool();
  }, [appUser?.schoolId]);

  return (
    <AuthContext.Provider value={{ user, appUser, school, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
