import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Attendance, Student, Class, Division, Holiday } from '../types';
import { generateAttendanceReport } from '../utils/pdfGenerator';
import { FileText, Calendar, Users } from 'lucide-react';
import { format, parse } from 'date-fns';
import { MonthPickerModal } from '../components/MonthPickerModal';

export const AttendanceReportPage: React.FC = () => {
  const { appUser, school } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(false);
  const [monthPickerModal, setMonthPickerModal] = useState<{ show: boolean }>({ show: false });

  useEffect(() => {
    if (!appUser) return;
    const fetchData = async () => {
      const schoolId = appUser.schoolId;
      const [classesSnap, divisionsSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'divisions'), where('schoolId', '==', schoolId)))
      ]);
      setClasses(classesSnap.docs.map(doc => doc.data() as Class));
      setDivisions(divisionsSnap.docs.map(doc => doc.data() as Division));
    };
    fetchData();
  }, [appUser]);

  const handleGenerateReport = async () => {
    if (!appUser || !selectedDivision) {
      return;
    }
    setLoading(true);
    try {
      const [attendanceSnap, studentsSnap, holidaysSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'attendance'),
          where('schoolId', '==', appUser.schoolId),
          where('divisionId', '==', selectedDivision)
        )),
        getDocs(query(
          collection(db, 'students'),
          where('schoolId', '==', appUser.schoolId),
          where('divisionId', '==', selectedDivision)
        )),
        getDocs(query(
          collection(db, 'holidays'),
          where('schoolId', '==', appUser.schoolId)
        ))
      ]);

      const attendanceRecords = attendanceSnap.docs
        .map(doc => doc.data() as Attendance)
        .filter(record => record.date.startsWith(selectedMonth));
      const students = studentsSnap.docs.map(doc => doc.data() as Student);
      const holidays = holidaysSnap.docs.map(doc => doc.data() as Holiday);
      const division = divisions.find(d => d.divisionId === selectedDivision);
      const className = classes.find(c => c.classId === division?.classId);
      const classStartDate = className?.startDate;
      const classNameStr = className?.name || 'Unknown';
      
      generateAttendanceReport(attendanceRecords, students, classNameStr, division?.name || 'Unknown', selectedMonth, holidays, school?.name || 'School Name', classStartDate);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'attendance_report_gen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6">
      <h1 className="text-3xl font-bold text-gray-900">Attendance Report</h1>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2">
          <option value="">Select Division</option>
          {divisions.map(div => <option key={div.divisionId} value={div.divisionId}>{div.name}</option>)}
        </select>
        <button
          onClick={() => setMonthPickerModal({ show: true })}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}
          </span>
        </button>
        {monthPickerModal.show && (
          <MonthPickerModal
            selectedMonth={selectedMonth}
            onSelectMonth={(month) => {
              setSelectedMonth(month);
              setMonthPickerModal({ show: false });
            }}
            onClose={() => setMonthPickerModal({ show: false })}
          />
        )}
        <button onClick={handleGenerateReport} disabled={loading || !selectedDivision} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">
          {loading ? 'Generating...' : 'Download PDF Report'}
        </button>
      </div>
    </div>
  );
};
