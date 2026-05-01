import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Student, Attendance, AttendanceRecord, Holiday } from '../types';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isAfter, isBefore } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAcademicYear } from '../contexts/AcademicYearContext';

interface AttendanceCalendarProps {
  student: Student;
  className: string;
  divisionName: string;
  onClose: () => void;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ student, className, divisionName, onClose }) => {
  const { academicYear } = useAcademicYear();
  const [startYear] = academicYear.split('-').map(Number);
  
  // Define academic year start/end dates: June 1st of startYear to May 31st of endYear
  const acadStart = new Date(startYear, 5, 1);
  const acadEnd = new Date(startYear + 1, 4, 31);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ensure initial date is within academic year
    if (currentDate < acadStart || currentDate > acadEnd) {
        setCurrentDate(acadStart);
    }
  }, [acadStart, acadEnd]);

  useEffect(() => {
    const fetchAttendance = async () => {
      setLoading(true);
      try {
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('schoolId', '==', student.schoolId)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const newRecords: Record<string, AttendanceRecord> = {};
        attendanceSnap.docs.forEach(doc => {
            const data = doc.data() as Attendance;
            const record = data.records.find(r => r.studentId === student.studentId);
            if(record) newRecords[data.date] = record;
        });
        setRecords(newRecords);

        // Fetch holidays for the school
        const holidayQuery = query(collection(db, 'holidays'), where('schoolId', '==', student.schoolId));
        const holidaySnap = await getDocs(holidayQuery);
        setHolidays(holidaySnap.docs.map(doc => doc.data() as Holiday));
      } catch (err) {
        console.error("Error fetching attendance data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [student.studentId, student.schoolId]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const getStatusColor = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday
    const isHoliday = holidays.some(h => h.date === dateStr && h.type === 'holiday');
    
    if (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) {
        return 'bg-gray-500 text-white';
    }

    const record = records[dateStr];
    if (!record) return 'bg-gray-200 text-gray-500'; // No record yet

    switch (record.status) {
      case 'full_day': return 'bg-green-500 text-white';
      case 'fn_only': return 'bg-blue-500 text-white';
      case 'an_only': return 'bg-blue-500 text-white';
      case 'absent': return 'bg-red-500 text-white';
      default: return 'bg-gray-200';
    }
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
        <h2 className="text-xl font-bold text-center">Students Attendance</h2>
        <div className="flex justify-between items-center my-4">
          <button onClick={handlePrevMonth} disabled={isBefore(subMonths(currentDate, 1), startOfMonth(acadStart))} className="disabled:opacity-30"><ChevronLeft /></button>
          <span className="font-bold">{format(currentDate, 'MMMM yyyy')}</span>
          <button onClick={handleNextMonth} disabled={isAfter(addMonths(currentDate, 1), endOfMonth(acadEnd))} className="disabled:opacity-30"><ChevronRight /></button>
        </div>
        <div className="text-center mb-4">
          <p className="font-bold">{student.name}</p>
          <p className="text-sm text-gray-500">{className} - {divisionName}</p>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold mb-2">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>
        <div className="grid grid-cols-7 gap-1 h-[240px] items-start">
            {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => <div key={`empty-${i}`} className="h-8" />)}
            {days.map(day => (
                <div key={day.toISOString()} className={`p-1 rounded text-center text-sm ${getStatusColor(day)} h-8 flex items-center justify-center`}>
                    {format(day, 'd')}
                </div>
            ))}
            {/* Pad to 6 rows to keep constant height */}
            {Array.from({ length: 42 - (getDay(startOfMonth(currentDate)) + days.length) }).map((_, i) => <div key={`pad-${i}`} className="h-8" />)}
        </div>
      </div>
    </div>
  );
};
