import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Class, Division, Attendance } from '../types';
import { FileText, Download, Calendar, Filter, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import Papa from 'papaparse';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export const Reports: React.FC = () => {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appUser) return;

    const fetchData = async () => {
      try {
        const schoolId = appUser.schoolId;
        const [classesSnap, divisionsSnap] = await Promise.all([
          getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
          getDocs(query(collection(db, 'divisions'), where('schoolId', '==', schoolId)))
        ]);

        setClasses(classesSnap.docs.map(doc => doc.data() as Class));
        setDivisions(divisionsSnap.docs.map(doc => doc.data() as Division));
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
      
      // 1. Fetch all attendance records for the division in the date range
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('divisionId', '==', selectedDivision),
        where('date', '>=', dateRange.start),
        where('date', '<=', dateRange.end),
        orderBy('date', 'asc')
      );

      const attendanceSnap = await getDocs(attendanceQuery);
      const attendanceData = attendanceSnap.docs.map(doc => doc.data() as Attendance);

      if (attendanceData.length === 0) {
        setError('No attendance records found for the selected period.');
        setGenerating(false);
        return;
      }

      // 2. Fetch students for this division to get their names
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

      // 3. Prepare CSV Data
      // Header: Date, Student Name, Status, Note
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
      const fileName = `Attendance_Report_${className}_${division?.name}_${dateRange.start}_to_${dateRange.end}.csv`;
      
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
        <p className="text-gray-500 mt-1">Generate and export attendance data in CSV format.</p>
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
              Start Date
            </label>
            <input 
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              End Date
            </label>
            <input 
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        <div className="pt-4">
          <button
            onClick={handleDownloadReport}
            disabled={generating || !selectedDivision}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            ) : (
              <>
                <Download className="h-6 w-6" />
                Generate & Download CSV Report
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
              The generated report will include daily attendance status (Present, Absent, Late, Leave) for all students in the selected division within the specified date range. You can open this CSV file in Microsoft Excel, Google Sheets, or any other spreadsheet software.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
