import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, setDoc, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAcademicYear, CURRENT_ACADEMIC_YEAR } from '../contexts/AcademicYearContext';
import { Student, Class, Division, Attendance, AttendanceRecord, Holiday, AcademicYearConfig } from '../types';
import { CheckCircle2, XCircle, Clock, FileText, Save, ChevronRight, Users, Calendar, X, AlertCircle } from 'lucide-react';
import { format, isSunday, isSaturday, parseISO } from 'date-fns';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { DatePickerModal } from '../components/DatePickerModal';

export const AttendancePage: React.FC = () => {
  const { user, appUser } = useAuth();
  const { academicYear } = useAcademicYear();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [previousAcademicYear, setPreviousAcademicYear] = useState<string>(academicYear);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});
  const [existingAttendanceId, setExistingAttendanceId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holidayInfo, setHolidayInfo] = useState<{ isHoliday: boolean, reason?: string } | null>(null);
  const [allHolidays, setAllHolidays] = useState<Holiday[]>([]);
  const [calendarModal, setCalendarModal] = useState<{ show: boolean, student: Student | null }>({ show: false, student: null });
  const [datePickerModal, setDatePickerModal] = useState<{ show: boolean }>({ show: false });

  useEffect(() => {
    if (academicYear !== previousAcademicYear) {
        const [startYear] = academicYear.split('-').map(Number);
        const today = new Date();
        
        const acadStart = new Date(startYear, 5, 1);
        const acadEnd = new Date(startYear + 1, 4, 31);
        
        if (today >= acadStart && today <= acadEnd) {
            setSelectedDate(format(today, 'yyyy-MM-dd'));
        } else {
            setSelectedDate(format(acadStart, 'yyyy-MM-dd'));
        }
        setPreviousAcademicYear(academicYear);
    }
  }, [academicYear, previousAcademicYear]);

  const getSelectedClassStartDate = () => {
    const division = divisions.find(d => d.divisionId === selectedDivision);
    if (!division) return undefined;
    const cls = classes.find(c => c.classId === division.classId);
    return cls?.startDate;
  };

  const isAttendanceAllowed = (student: Student, selectedDate: string, classStartDate?: string) => {
    const date = parseISO(selectedDate);
    const admissionDate = student.admissionDate ? parseISO(student.admissionDate) : null;
    const classStartDateObj = classStartDate ? parseISO(classStartDate) : null;

    if (admissionDate && date < admissionDate) return false;
    if (classStartDateObj && date < classStartDateObj) return false;
    return true;
  };

  useEffect(() => {
    if (!appUser) return;

    const fetchData = async () => {
      try {
        const schoolId = appUser.schoolId;

        // 1. Fetch AcademicYearConfigs
        const configsSnap = await getDocs(query(collection(db, 'academicYearConfigs'), where('schoolId', '==', schoolId), where('academicYear', '==', academicYear)));
        const configs = configsSnap.docs.map(doc => doc.data() as AcademicYearConfig);
        
        // 2. Fetch Classes
        const classesSnap = await getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId)));
        const classesDataRaw = classesSnap.docs.map(doc => doc.data() as Class);
        
        const classesData = classesDataRaw.map(cls => {
          const config = configs.find(c => c.classId === cls.classId && !c.divisionId);
          return { ...cls, startDate: config?.startDate || cls.startDate };
        });
        setClasses(classesData);

        // 3. Fetch Divisions
        let divisionsQuery = query(collection(db, 'divisions'), where('schoolId', '==', schoolId));
        const divisionsSnap = await getDocs(divisionsQuery);
        let divisionsData = divisionsSnap.docs.map(doc => doc.data() as Division);
        
        // Filter divisions by configs (and optionally teacherId)
        divisionsData = divisionsData.filter(d => {
            const config = configs.find(c => c.divisionId === d.divisionId);
            if (!config) return false;
            if (appUser.role === 'teacher' && config.teacherId !== appUser.uid) return false;
            return true;
        });
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
  }, [appUser, academicYear]);

  useEffect(() => {
    if (!selectedDivision || !selectedDate) return;

    const fetchStudentsAndAttendance = async () => {
      setLoading(true);
      try {
        const schoolId = appUser.schoolId;
        
        // 1. Check for holidays
        // Holiday check will be done after fetching holidays safely in Promise.all 

        // 2. Fetch Students, Existing Attendance, and ALL holidays in parallel
        const [studentsSnap, attendanceSnap, allHolidaysSnap, todayHolidaySnap] = await Promise.all([
          getDocs(query(
            collection(db, 'students'),
            where('schoolId', '==', schoolId)
          )),
          getDocs(query(
            collection(db, 'attendance'),
            where('schoolId', '==', schoolId),
            where('divisionId', '==', selectedDivision),
            where('date', '==', selectedDate)
          )),
          getDocs(query(collection(db, 'holidays'), where('schoolId', '==', schoolId))),
          getDocs(query(
            collection(db, 'holidays'),
            where('schoolId', '==', schoolId),
            where('date', '==', selectedDate)
          ))
        ]);

        let studentsData = studentsSnap.docs.map(doc => doc.data() as Student);
        
        // Filter students based on academic year and division
        const [startYear, endYear] = academicYear.split('-').map(Number);
        const startOfAcademicYear = new Date(startYear, 5, 1);
        const endOfAcademicYear = new Date(endYear, 4, 31);
        
        studentsData = studentsData.filter(student => {
          const sortedHistory = [...(student.classHistory || [])].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
          const history = sortedHistory.find(h => {
            const startDate = new Date(h.startDate);
            const endDate = h.endDate ? new Date(h.endDate) : new Date(2099, 11, 31);
            return startDate <= endOfAcademicYear && endDate >= startOfAcademicYear && h.divisionId === selectedDivision;
          });
          return !!history;
        });
        
        setStudents([...studentsData].sort((a, b) => a.name.localeCompare(b.name)));
        setAllHolidays(allHolidaysSnap.docs.map(doc => doc.data() as Holiday));
        
        const dateObj = parseISO(selectedDate);
        const isSun = isSunday(dateObj);
        const isSat = isSaturday(dateObj);
        
        let isHoliday = isSun || isSat;
        let holidayReason = isSun ? 'Sunday' : (isSat ? 'Saturday' : undefined);
        
        if (!todayHolidaySnap.empty) {
          const holidayData = todayHolidaySnap.docs[0].data() as Holiday;
          if (holidayData.type === 'holiday') {
            isHoliday = true;
            holidayReason = holidayData.reason || 'Public Holiday';
          } else if (holidayData.type === 'working_saturday') {
            isHoliday = false;
            holidayReason = undefined;
          }
        }
        
        setHolidayInfo({ isHoliday, reason: holidayReason });

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
              records[s.studentId] = { studentId: s.studentId, status: 'full_day' };
            }
          });
          
          setAttendanceRecords(records);
        } else {
          setExistingAttendanceId(null);
          const initialRecords: Record<string, AttendanceRecord> = {};
          studentsData.forEach(s => {
            initialRecords[s.studentId] = { studentId: s.studentId, status: 'full_day' };
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
  }, [selectedDivision, selectedDate, appUser, academicYear]);

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
    
    // Filter out students for whom attendance is not allowed
    const classStartDate = getSelectedClassStartDate();
    const validRecords = Object.values(attendanceRecords).filter(record => {
      const student = students.find(s => s.studentId === record.studentId);
      return student && isAttendanceAllowed(student, selectedDate, classStartDate);
    });

    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const division = divisions.find(d => d.divisionId === selectedDivision);
      if (!division) return;

      const attendanceId = existingAttendanceId || `${appUser.schoolId}_${selectedDivision}_${selectedDate}`;
      const className = classes.find(c => c.classId === division.classId)?.name || 'Unknown Class';

      const attendanceData: Attendance = {
        attendanceId,
        schoolId: appUser.schoolId,
        classId: division.classId,
        divisionId: selectedDivision,
        className,
        divisionName: division.name,
        date: selectedDate,
        records: validRecords,
        submittedBy: user?.uid || '',
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

  const isAdmin = appUser?.role === 'admin' || appUser?.role === 'it_coordinator';
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Daily Attendance</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date: {format(parseISO(selectedDate), 'MMMM do, yyyy')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {isAdmin && (
            <button
              onClick={() => setDatePickerModal({ show: true })}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 flex items-center gap-2 shadow-sm"
            >
              <Calendar className="h-4 w-4 text-blue-600" />
              {format(parseISO(selectedDate), 'MMMM do, yyyy')}
            </button>
          )}
          {datePickerModal.show && (
            <DatePickerModal
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setDatePickerModal({ show: false });
              }}
              onClose={() => setDatePickerModal({ show: false })}
              holidays={allHolidays}
            />
          )}
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

      {holidayInfo?.isHoliday && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <div>
            <p className="text-orange-700 font-bold">Holiday Alert</p>
            <p className="text-orange-600 text-sm">Today is marked as a holiday ({holidayInfo.reason}). Attendance is usually not required.</p>
          </div>
        </div>
      )}

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

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl animate-in fade-in slide-in-from-top-4 duration-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors p-1 hover:bg-red-100 rounded-lg">
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
          {students.map((student, index) => {
            const classStartDate = getSelectedClassStartDate();
            const allowed = isAttendanceAllowed(student, selectedDate, classStartDate);
            return (
              <div key={student.studentId} className={`p-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6 ${!allowed ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p 
                        className="font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => setCalendarModal({ show: true, student })}
                      >
                        {student.name}
                      </p>
                      <p className="text-xs text-gray-500">ID: {student.admissionNumber}</p>
                      {!allowed && <p className="text-xs text-red-500 font-bold">Attendance not allowed for this date</p>}
                    </div>
                  </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    {[
                      { id: 'full_day', label: 'Full Day', color: 'text-green-600', bg: 'bg-green-50' },
                      { id: 'fn_only', label: 'FN Only', color: 'text-blue-600', bg: 'bg-blue-50' },
                      { id: 'an_only', label: 'AN Only', color: 'text-purple-600', bg: 'bg-purple-50' },
                      { id: 'absent', label: 'Absent', color: 'text-red-600', bg: 'bg-red-50' },
                    ].map((status) => (
                      <button
                        key={status.id}
                        disabled={!allowed}
                        onClick={() => handleStatusChange(student.studentId, status.id as any)}
                        className={`px-3 py-2 rounded-lg transition-all text-xs font-bold ${
                          attendanceRecords[student.studentId]?.status === status.id
                            ? `${status.bg} ${status.color} shadow-sm ring-1 ring-black/5`
                            : 'text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Add note..."
                    disabled={!allowed}
                    value={attendanceRecords[student.studentId]?.note || ''}
                    onChange={(e) => handleNoteChange(student.studentId, e.target.value)}
                    className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-40"
                  />
                </div>
              </div>
            );
          })}

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
            className={`${existingAttendanceId ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'} text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 disabled:opacity-50`}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {existingAttendanceId ? 'Update Attendance' : 'Submit Attendance'}
              </>
            )}
          </button>
        </div>
      </div>
      {calendarModal.show && calendarModal.student && (
        <AttendanceCalendar
          student={calendarModal.student}
          className={classes.find(c => c.classId === calendarModal.student.classId)?.name || 'Unknown'}
          divisionName={divisions.find(d => d.divisionId === calendarModal.student.divisionId)?.name || 'Unknown'}
          onClose={() => setCalendarModal({ show: false, student: null })}
        />
      )}
    </div>
  );
};
