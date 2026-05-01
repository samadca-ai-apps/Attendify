import React, { useState } from 'react';
import { format, addMonths, subMonths, parse, isBefore, isAfter } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAcademicYear } from '../contexts/AcademicYearContext';

interface MonthPickerModalProps {
  selectedMonth: string; // YYYY-MM
  onSelectMonth: (month: string) => void;
  onClose: () => void;
  academicYear?: string; // Optional override
}

export const MonthPickerModal: React.FC<MonthPickerModalProps> = ({ selectedMonth, onSelectMonth, onClose, academicYear: propAcademicYear }) => {
  const contextAcademicYear = useAcademicYear();
  const academicYear = propAcademicYear || contextAcademicYear.academicYear;
  const [startYear] = academicYear.split('-').map(Number);
  
  const acadStart = new Date(startYear, 5, 1);
  const acadEnd = new Date(startYear + 1, 4, 31);

  const months = [
    'June', 'July', 'August', 'September', 'October', 'November', 
    'December', 'January', 'February', 'March', 'April', 'May'
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl w-96 max-w-full shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>
        <h2 className="text-xl font-bold text-center mb-4">Select Month</h2>
        <div className="flex justify-center items-center mb-4">
          <span className="font-bold text-lg bg-gray-100 px-4 py-1 rounded-full">{academicYear}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
            {months.map((month, index) => {
                const yearOffset = index >= 6 ? 1 : 0;
                const monthIndex = index >= 6 ? index - 6 : index + 5;
                const mDate = new Date(startYear + yearOffset, monthIndex, 1);
                
                const monthStr = format(mDate, 'yyyy-MM');
                const isSelectable = mDate >= acadStart && mDate <= acadEnd;
                
                return (
                    <button 
                        key={month}
                        onClick={() => isSelectable && onSelectMonth(monthStr)}
                        disabled={!isSelectable}
                        className={`p-3 rounded text-center text-sm transition-colors ${selectedMonth === monthStr ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'} ${!isSelectable ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {month}
                    </button>
                );
            })}
        </div>
      </div>
    </div>
  );
};
