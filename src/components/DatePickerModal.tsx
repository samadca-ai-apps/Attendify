import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isAfter, isBefore, isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAcademicYear } from '../contexts/AcademicYearContext';

import { Holiday } from '../types';

interface DatePickerModalProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  holidays: Holiday[]; // Changed from string[] to Holiday[]
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({ selectedDate, onSelectDate, onClose, holidays }) => {
  const { academicYear } = useAcademicYear();
  const [startYear] = academicYear.split('-').map(Number);
  
  const acadStart = new Date(startYear, 5, 1);
  const acadEnd = new Date(startYear + 1, 4, 31);

  const [currentDate, setCurrentDate] = useState(parseISO(selectedDate));
  
  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const getDayStyle = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayOfWeek = getDay(date);
    const holiday = holidays.find(h => h.date === dateStr);
    const isHoliday = holiday && holiday.type === 'holiday';
    const isWorkingSaturday = holiday && holiday.type === 'working_saturday';
    
    // Default weekend: Saturday (6), Sunday (0)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // A day is "off" if it is a holiday AND NOT a working saturday
    const isOff = isHoliday || (isWeekend && !isWorkingSaturday);

    if (isOff) {
        return 'bg-red-500 text-white';
    }

    if (isSameDay(date, parseISO(selectedDate))) {
        return 'bg-blue-600 text-white font-bold';
    }

    return 'bg-white hover:bg-gray-100 text-gray-900';
  };

  const handlePrevMonth = () => {
    const prev = subMonths(currentDate, 1);
    if (!isBefore(prev, acadStart)) setCurrentDate(prev);
  };

  const handleNextMonth = () => {
    const next = addMonths(currentDate, 1);
    if (!isAfter(next, acadEnd)) setCurrentDate(next);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl w-96 max-w-full shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>
        <h2 className="text-xl font-bold text-center mb-4">Select Date</h2>
        <div className="flex justify-between items-center mb-4">
          <button onClick={handlePrevMonth} disabled={isBefore(subMonths(currentDate, 1), startOfMonth(acadStart))} className="disabled:opacity-30"><ChevronLeft /></button>
          <span className="font-bold">{format(currentDate, 'MMMM yyyy')}</span>
          <button onClick={handleNextMonth} disabled={isAfter(addMonths(currentDate, 1), endOfMonth(acadEnd))} className="disabled:opacity-30"><ChevronRight /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold mb-2">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>
        <div className="grid grid-cols-7 gap-1 h-[240px] items-start">
            {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => <div key={`empty-${i}`} className="h-8" />)}
            {days.map(day => (
                <button 
                  key={day.toISOString()} 
                  onClick={() => onSelectDate(format(day, 'yyyy-MM-dd'))}
                  className={`p-1 rounded text-center text-sm h-8 flex items-center justify-center ${getDayStyle(day)}`}
                >
                    {format(day, 'd')}
                </button>
            ))}
            {Array.from({ length: 42 - (getDay(startOfMonth(currentDate)) + days.length) }).map((_, i) => <div key={`pad-${i}`} className="h-8" />)}
        </div>
      </div>
    </div>
  );
};
