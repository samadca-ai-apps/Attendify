import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

interface AcademicYearContextType {
  academicYear: string;
  setAcademicYear: (year: string) => void;
  academicYears: string[];
  fetchAcademicYears: () => Promise<void>;
}

export const CURRENT_ACADEMIC_YEAR = '2025-2026';
export const HARDCODED_YEARS = ['2024-2025', CURRENT_ACADEMIC_YEAR];

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [academicYear, setAcademicYear] = useState(CURRENT_ACADEMIC_YEAR);
  const [academicYears, setAcademicYears] = useState<string[]>(HARDCODED_YEARS);
  const { appUser } = useAuth();

  const fetchAcademicYears = async () => {
    if (!appUser?.schoolId) return;
    
    const querySnapshot = await getDocs(query(collection(db, 'academicYears'), where('schoolId', '==', appUser.schoolId)));
    const fetchedYears = querySnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
    
    // Create a map of year -> hidden status
    const hiddenStatusMap = new Map();
    fetchedYears.forEach(y => hiddenStatusMap.set(y.year, y.hidden));

    // Combine all potential years
    const allKnownYears = Array.from(new Set([...fetchedYears.map(y => y.year), ...HARDCODED_YEARS]));

    // Filter out hidden years
    const activeYears = allKnownYears.filter(year => !hiddenStatusMap.get(year));
    
    setAcademicYears(activeYears.sort().reverse());
  };

  useEffect(() => {
    fetchAcademicYears();
  }, [appUser]);

  return (
    <AcademicYearContext.Provider value={{ academicYear, setAcademicYear, academicYears, fetchAcademicYears }}>
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => {
  const context = useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
};
