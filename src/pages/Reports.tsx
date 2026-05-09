import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAcademicYear } from '../contexts/AcademicYearContext';
import { Class, Division, Attendance, Student, Holiday, AcademicYearConfig } from '../types';
import { FileText, Download, Calendar, Filter, ChevronRight, AlertCircle, CheckCircle2, FileDown } from 'lucide-react';
import Papa from 'papaparse';
import { format, startOfMonth, parse } from 'date-fns';
import { generateAttendanceReport, generateYearlyAttendanceReport } from '../utils/pdfGenerator';
import { MonthPickerModal } from '../components/MonthPickerModal';

export const Reports: React.FC = () => {
  const { appUser, school } = useAuth();
  const { academicYear, setAcademicYear } = useAcademicYear();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthPickerModal, setMonthPickerModal] = useState<{ show: boolean }>({ show: false });

  useEffect(() => {
    if (!appUser) return;

    const fetchData = async () => {
      try {
        const schoolId = appUser.schoolId;
        const [classesSnap, divisionsSnap, configsSnap] = await Promise.all([
          getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
          getDocs(query(collection(db, 'divisions'), where('schoolId', '==', schoolId))),
          getDocs(query(collection(db, 'academicYearConfigs'), where('schoolId', '==', schoolId), where('academicYear', '==', academicYear)))
        ]);

        setClasses(classesSnap.docs.map(doc => doc.data() as Class));
        
        const configs = configsSnap.docs.map(doc => doc.data() as AcademicYearConfig);
        const divisionsData = divisionsSnap.docs
            .map(doc => doc.data() as Division)
            .filter(d => configs.some(c => c.divisionId === d.divisionId));
        setDivisions(divisionsData);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'reports_init');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [appUser]);

  const handleDownloadReport = async () => {
    if (!appUser || !selectedDivision) {
      setError('Please select a division first.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const schoolId = appUser.schoolId;
      
      const attendanceSnap = await getDocs(query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('divisionId', '==', selectedDivision)
      ));
      const attendanceData = attendanceSnap.docs
        .map(doc => doc.data() as Attendance)
        .filter(record => record.date.startsWith(selectedMonth));

      if (attendanceData.length === 0) {
        setError('No attendance records found for the selected month.');
        setGenerating(false);
        return;
      }

      const studentsSnap = await getDocs(query(
        collection(db, 'students'),
        where('schoolId', '==', schoolId),
        where('divisionId', '==', selectedDivision)
      ));
      const students = studentsSnap.docs.map(doc => doc.data());
      const studentMap: Record<string, string> = {};
      students.forEach(s => {
        studentMap[s.studentId] = s.name;
      });

      const csvData: any[] = [];
      
      attendanceData.forEach(record => {
        record.records.forEach(r => {
          csvData.push({
            'Date': record.date,
            'Student Name': studentMap[r.studentId] || 'Unknown Student',
            'Status': r.status.toUpperCase(),
            'Note': r.note || ''
          });
        });
      });

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const division = divisions.find(d => d.divisionId === selectedDivision);
      const className = classes.find(c => c.classId === division?.classId)?.name || 'Class';
      const fileName = `Attendance_Report_${className}_${division?.name}_${selectedMonth}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('Report generation error:', err);
      setError('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!appUser || !selectedDivision) {
      setError('Please select a division first.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const schoolId = appUser.schoolId;
      
      const [attendanceSnap, studentsSnap, holidaysSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'attendance'),
          where('schoolId', '==', schoolId),
          where('divisionId', '==', selectedDivision)
        )),
        getDocs(query(
          collection(db, 'students'),
          where('schoolId', '==', schoolId),
          where('divisionId', '==', selectedDivision)
        )),
        getDocs(query(
          collection(db, 'holidays'),
          where('schoolId', '==', schoolId)
        ))
      ]);
      const attendanceData = attendanceSnap.docs
        .map(doc => doc.data() as Attendance)
        .filter(record => record.date.startsWith(selectedMonth));
      const students = studentsSnap.docs.map(doc => doc.data() as Student);
      const holidays = holidaysSnap.docs.map(doc => doc.data() as Holiday);

      const division = divisions.find(d => d.divisionId === selectedDivision);
      const className = classes.find(c => c.classId === division?.classId);
      const classStartDate = className?.startDate;
      const classNameStr = className?.name || 'Unknown';

      generateAttendanceReport(attendanceData, students, classNameStr, division?.name || 'Division', selectedMonth, holidays, school?.name || 'School Name', classStartDate);

    } catch (err) {
      console.error('PDF generation error:', err);
      setError('Failed to generate PDF report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadYearlyPDF = async () => {
    if (!appUser || !selectedDivision) {
      setError('Please select a division first.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const schoolId = appUser.schoolId;
      
      const [attendanceSnap, studentsSnap, holidaysSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'attendance'),
          where('schoolId', '==', schoolId),
          where('divisionId', '==', selectedDivision)
        )),
        getDocs(query(
          collection(db, 'students'),
          where('schoolId', '==', schoolId),
          where('divisionId', '==', selectedDivision)
        )),
        getDocs(query(
          collection(db, 'holidays'),
          where('schoolId', '==', schoolId)
        ))
      ]);
      const attendanceData = attendanceSnap.docs.map(doc => doc.data() as Attendance);
      const students = studentsSnap.docs.map(doc => doc.data() as Student);
      const holidays = holidaysSnap.docs.map(doc => doc.data() as Holiday);

      const division = divisions.find(d => d.divisionId === selectedDivision);
      const className = classes.find(c => c.classId === division?.classId);
      const classStartDate = className?.startDate;
      const classNameStr = className?.name || 'Unknown';

      generateYearlyAttendanceReport(attendanceData, students, classNameStr, division?.name || 'Division', academicYear, holidays, school?.name || 'Attendify', classStartDate);

    } catch (err) {
      console.error('Yearly PDF generation error:', err);
      setError('Failed to generate yearly PDF report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Download Reports</h1>
        <p className="text-gray-500 mt-1">Generate and export attendance data in CSV or PDF format.</p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-600" />
              Select Class
            </label>
            <select 
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedDivision('');
              }}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-blue-600" />
              Select Division
            </label>
            <select 
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select Division</option>
              {divisions
                .filter(d => !selectedClass || d.classId === selectedClass)
                .map(d => (
                  <option key={d.divisionId} value={d.divisionId}>
                    {classes.find(c => c.classId === d.classId)?.name} - {d.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Select Month
            </label>
            <input 
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none hidden"
            />
            <button
              onClick={() => setMonthPickerModal({ show: true })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-left flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                {format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}
              </span>
            </button>
            {monthPickerModal.show && (
              <MonthPickerModal
                selectedMonth={selectedMonth}
                academicYear={academicYear}
                onSelectMonth={(month) => {
                  setSelectedMonth(month);
                  setMonthPickerModal({ show: false });
                }}
                onClose={() => setMonthPickerModal({ show: false })}
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Academic Year
            </label>
            <select 
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="2025-2026">2025-2026</option>
              <option value="2024-2025">2024-2025</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        <div className="pt-4 flex gap-4">
          <button
            onClick={handleDownloadReport}
            disabled={generating || !selectedDivision}
            className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            ) : (
              <>
                <Download className="h-6 w-6" />
                Download CSV Report
              </>
            )}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={generating || !selectedDivision}
            className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            ) : (
              <>
                <FileDown className="h-6 w-6" />
                Download PDF Report
              </>
            )}
          </button>
          <button
            onClick={handleDownloadYearlyPDF}
            disabled={generating || !selectedDivision}
            className="flex-1 bg-purple-600 text-white py-4 rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            ) : (
              <>
                <FileDown className="h-6 w-6" />
                Download Yearly PDF Report
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
        <div className="flex gap-4">
          <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-blue-900">Report Information</h4>
            <p className="text-sm text-blue-700 mt-1 leading-relaxed">
              The generated report will include daily attendance status (Present, Absent, Late, Leave) for all students in the selected division within the specified date range. You can open this CSV file in Microsoft Excel, Google Sheets, or any other spreadsheet software. The PDF report will be in A4 format.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
