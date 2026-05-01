import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AcademicYearContextType {
  academicYear: string;
  setAcademicYear: (year: string) => void;
}

export const CURRENT_ACADEMIC_YEAR = '2025-2026';

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [academicYear, setAcademicYear] = useState(CURRENT_ACADEMIC_YEAR); // Default to current

  return (
    <AcademicYearContext.Provider value={{ academicYear, setAcademicYear }}>
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
