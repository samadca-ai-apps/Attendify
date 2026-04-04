import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, setDoc, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Student, Class, Division, Attendance, AttendanceRecord } from '../types';
import { CheckCircle2, XCircle, Clock, FileText, Save, ChevronRight, Users, Calendar, X } from 'lucide-react';
import { format } from 'date-fns';

export const AttendancePage: React.FC = () => {
  const { appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});
  const [existingAttendanceId, setExistingAttendanceId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!appUser) return;

    const fetchData = async () => {
      try {
        const schoolId = appUser.schoolId;

        // 1. Fetch Classes
        const classesSnap = await getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId)));
        const classesData = classesSnap.docs.map(doc => doc.data() as Class);
        setClasses(classesData);

        // 2. Fetch Divisions (assigned to this teacher if role is teacher)
        let divisionsQuery = query(collection(db, 'divisions'), where('schoolId', '==', schoolId));
        if (appUser.role === 'teacher') {
          divisionsQuery = query(divisionsQuery, where('teacherId', '==', appUser.uid));
        }
        const divisionsSnap = await getDocs(divisionsQuery);
        const divisionsData = divisionsSnap.docs.map(doc => doc.data() as Division);
        setDivisions(divisionsData);

        if (divisionsData.length > 0) {
          setSelectedDivision(divisionsData[0].divisionId);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'attendance_init');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [appUser]);

  useEffect(() => {
    if (!selectedDivision) return;

    const fetchStudentsAndAttendance = async () => {
      setLoading(true);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const schoolId = appUser.schoolId;
        
        // 1. Fetch Students and Existing Attendance in parallel
        const [studentsSnap, attendanceSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'students'),
            where('schoolId', '==', schoolId),
            where('divisionId', '==', selectedDivision),
            where('status', '==', 'active')
          )),
          getDocs(query(
            collection(db, 'attendance'),
            where('schoolId', '==', schoolId),
            where('divisionId', '==', selectedDivision),
            where('date', '==', today)
          ))
        ]);

        const studentsData = studentsSnap.docs.map(doc => doc.data() as Student);
        setStudents(studentsData);

        if (!attendanceSnap.empty) {
          const existingData = attendanceSnap.docs[0].data() as Attendance;
          setExistingAttendanceId(attendanceSnap.docs[0].id);
          
          const records: Record<string, AttendanceRecord> = {};
          existingData.records.forEach(r => {
            records[r.studentId] = r;
          });
          
          // Fill in any missing students (if new students were added after attendance was taken)
          studentsData.forEach(s => {
            if (!records[s.studentId]) {
              records[s.studentId] = { studentId: s.studentId, status: 'present' };
            }
          });
          
          setAttendanceRecords(records);
        } else {
          setExistingAttendanceId(null);
          const initialRecords: Record<string, AttendanceRecord> = {};
          studentsData.forEach(s => {
            initialRecords[s.studentId] = { studentId: s.studentId, status: 'present' };
          });
          setAttendanceRecords(initialRecords);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'attendance_fetch_all');
      } finally {
        setLoading(false);
      }
    };

    fetchStudentsAndAttendance();
  }, [selectedDivision, appUser]);

  const handleStatusChange = (studentId: string, status: AttendanceRecord['status']) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], note }
    }));
  };

  const handleSubmit = async () => {
    if (!appUser || !selectedDivision) return;
    setSaving(true);
    setSuccess(false);

    try {
      const division = divisions.find(d => d.divisionId === selectedDivision);
      if (!division) return;

      const today = format(new Date(), 'yyyy-MM-dd');
      const attendanceId = existingAttendanceId || `${appUser.schoolId}_${selectedDivision}_${today}`;

      const attendanceData: Attendance = {
        attendanceId,
        schoolId: appUser.schoolId,
        classId: division.classId,
        divisionId: selectedDivision,
        date: today,
        records: Object.values(attendanceRecords),
        submittedBy: appUser.uid,
        timestamp: new Date().toISOString(),
      };

      await setDoc(doc(db, 'attendance', attendanceId), attendanceData);
      
      setExistingAttendanceId(attendanceId);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'attendance_submit');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !selectedDivision) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Daily Attendance</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today: {format(new Date(), 'MMMM do, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          >
            {divisions.map(div => {
              const cls = classes.find(c => c.classId === div.classId);
              return (
                <option key={div.divisionId} value={div.divisionId}>
                  {cls?.name} - {div.name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl animate-in fade-in slide-in-from-top-4 duration-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-green-700 font-medium">Attendance submitted successfully!</p>
          </div>
          <button onClick={() => setSuccess(false)} className="text-green-400 hover:text-green-600 transition-colors p-1 hover:bg-green-100 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="font-bold text-gray-900">Student List</h2>
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
              {students.length} Total
            </span>
          </div>
          <div className="flex gap-4 text-xs font-medium text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div> Present
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div> Absent
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {students.map((student, index) => (
            <div key={student.studentId} className="p-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold">
                  {index + 1}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{student.name}</p>
                  <p className="text-xs text-gray-500">ID: {student.admissionNumber}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  {[
                    { id: 'present', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
                    { id: 'absent', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
                    { id: 'late', icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { id: 'leave', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
                  ].map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(student.studentId, status.id as any)}
                      className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                        attendanceRecords[student.studentId]?.status === status.id
                          ? `${status.bg} ${status.color} shadow-sm ring-1 ring-black/5`
                          : 'text-gray-400 hover:bg-gray-200'
                      }`}
                      title={status.id.charAt(0).toUpperCase() + status.id.slice(1)}
                    >
                      <status.icon className="h-5 w-5" />
                      <span className={`text-xs font-bold capitalize ${attendanceRecords[student.studentId]?.status === status.id ? 'block' : 'hidden'}`}>
                        {status.id}
                      </span>
                    </button>
                  ))}
                </div>
                
                <input
                  type="text"
                  placeholder="Add note..."
                  value={attendanceRecords[student.studentId]?.note || ''}
                  onChange={(e) => handleNoteChange(student.studentId, e.target.value)}
                  className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-40"
                />
              </div>
            </div>
          ))}

          {students.length === 0 && (
            <div className="p-12 text-center">
              <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-gray-300" />
              </div>
              {divisions.length === 0 ? (
                <p className="text-gray-500">
                  {appUser?.role === 'teacher' 
                    ? "You are not assigned to any division. Please contact the administrator."
                    : "No divisions found in the school. Please set up divisions in Management."}
                </p>
              ) : (
                <p className="text-gray-500">No students found in this division.</p>
              )}
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={saving || students.length === 0}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Submit Attendance
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
