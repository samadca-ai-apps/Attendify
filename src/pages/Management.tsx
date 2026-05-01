import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, setDoc, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth, secondaryAuth, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAcademicYear, CURRENT_ACADEMIC_YEAR } from '../contexts/AcademicYearContext';
import { Class, Division, User, Student, Holiday, AcademicYearConfig } from '../types';
import { Plus, Trash2, UserPlus, Upload, Download, GraduationCap, ArrowRight, CheckCircle2, AlertCircle, FileSpreadsheet, BookOpen, Users, X, ShieldCheck, UserCog, Calendar, Save } from 'lucide-react';
import Papa from 'papaparse';
import { format, parseISO } from 'date-fns';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { DatePickerModal } from '../components/DatePickerModal';

export const Management: React.FC = () => {
  const { appUser } = useAuth();
  const { academicYear } = useAcademicYear();
  const [activeTab, setActiveTab] = useState<'classes' | 'teachers' | 'students' | 'promotion' | 'holidays'>('classes');
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [students, setStudents] = useState<(Student & { displayClassId: string, displayDivisionId: string })[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedClassForStudent, setSelectedClassForStudent] = useState<string>('');
  const [selectedToClassForPromotion, setSelectedToClassForPromotion] = useState<string>('');
  const [selectedToDivisionForPromotion, setSelectedToDivisionForPromotion] = useState<string>('');
  const [selectedStudentsForPromotion, setSelectedStudentsForPromotion] = useState<Set<string>>(new Set());
  const [selectedStudentsForPassOut, setSelectedStudentsForPassOut] = useState<Set<string>>(new Set());
  const [fromDivisionId, setFromDivisionId] = useState<string>('');
  
  // Student Filters
  const [studentFilterClass, setStudentFilterClass] = useState<string>('');
  const [studentFilterDivision, setStudentFilterDivision] = useState<string>('');
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });
  const [resetModal, setResetModal] = useState<{
    show: boolean;
    teacher: User | null;
  }>({ show: false, teacher: null });
  const [studentActionModal, setStudentActionModal] = useState<{
    show: boolean;
    student: Student | null;
    action: 'pass-out' | 'terminate' | null;
  }>({ show: false, student: null, action: null });
  const [calendarModal, setCalendarModal] = useState<{ show: boolean, student: Student | null }>({ show: false, student: null });
  const [datePickerModal, setDatePickerModal] = useState<{ show: boolean }>({ show: false });
  const [selectedHolidayDate, setSelectedHolidayDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [editingStartDate, setEditingStartDate] = useState<{ classId: string, date: string } | null>(null);

  const fetchData = async () => {
    if (!appUser) return;
    setLoading(true);
    try {
      const schoolId = appUser.schoolId;
      const [startYear, endYear] = academicYear.split('-').map(Number);
      const startOfAcademicYear = new Date(startYear, 5, 1); // June 1st
      const endOfAcademicYear = new Date(endYear, 4, 31); // May 31st
      
      const [classesSnap, divisionsSnap, teachersSnap, studentsSnap, holidaysSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'divisions'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', 'in', ['teacher', 'it_coordinator']))),
        getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'holidays'), where('schoolId', '==', schoolId)))
      ]);

      let configs: AcademicYearConfig[] = [];
      try {
        const configsSnap = await getDocs(query(collection(db, 'academicYearConfigs'), where('schoolId', '==', schoolId), where('academicYear', '==', academicYear)));
        configs = configsSnap.docs.map(doc => doc.data() as AcademicYearConfig);
      } catch (e) {
        console.warn("Error fetching configs, might not exist yet", e);
      }
      
      const classesData = classesSnap.docs.map(doc => {
        const cls = doc.data() as Class;
        const config = configs.find(c => c.classId === cls.classId && !c.divisionId);
        return { ...cls, startDate: config?.startDate || cls.startDate };
      });
      setClasses(classesData);

      const divisionsData = divisionsSnap.docs.map(doc => {
        const div = doc.data() as Division;
        const config = configs.find(c => c.divisionId === div.divisionId);
        return { ...div, teacherId: config?.teacherId || div.teacherId };
      });
      setDivisions(divisionsData);
      setTeachers(teachersSnap.docs.map(doc => doc.data() as User));
      
      // Filter students based on academic year
      const allStudents = studentsSnap.docs.map(doc => doc.data() as Student);
      const filteredStudents = allStudents.reduce((acc, student) => {
        let displayClassId = student.classId;
        let displayDivisionId = student.divisionId;
        let isEnrolled = true;

        if (academicYear !== CURRENT_ACADEMIC_YEAR) {
          const sortedHistory = [...student.classHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
          const history = sortedHistory.find(h => {
            const startDate = new Date(h.startDate);
            const endDate = h.endDate ? new Date(h.endDate) : new Date(2099, 11, 31);
            return startDate <= endOfAcademicYear && endDate >= startOfAcademicYear;
          });

          if (history) {
            displayClassId = history.classId;
            displayDivisionId = history.divisionId;
          } else {
            isEnrolled = false;
          }
        }

        if (isEnrolled) {
          acc.push({
            ...student,
            displayClassId,
            displayDivisionId
          });
        }
        return acc;
      }, [] as (Student & { displayClassId: string, displayDivisionId: string })[]);

      setStudents(filteredStudents);
      setHolidays(holidaysSnap.docs.map(doc => doc.data() as Holiday));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'management_fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [appUser, academicYear]);

  const handleAddClass = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const startDate = formData.get('startDate') as string;
    if (!appUser || !name) return;

    try {
      const classId = `CLS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await setDoc(doc(db, 'classes', classId), {
        classId,
        schoolId: appUser.schoolId,
        name
      });
      
      const configId = `${appUser.schoolId}_${academicYear}_${classId}`;
      await setDoc(doc(db, 'academicYearConfigs', configId), {
        configId,
        schoolId: appUser.schoolId,
        academicYear,
        classId,
        startDate
      });

      setSuccess('Class added successfully!');
      fetchData();
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError('Failed to add class.');
    }
  };

  const handleAddDivision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const classId = formData.get('classId') as string;
    const teacherId = formData.get('teacherId') as string;
    if (!appUser || !name || !classId) return;

    try {
      const divisionId = `DIV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await setDoc(doc(db, 'divisions', divisionId), {
        divisionId,
        schoolId: appUser.schoolId,
        classId,
        name,
      });
      
      const configId = `${appUser.schoolId}_${academicYear}_${divisionId}`;
      const configData: any = {
        configId,
        schoolId: appUser.schoolId,
        academicYear,
        classId,
        divisionId
      };
      if (teacherId) configData.teacherId = teacherId;
      await setDoc(doc(db, 'academicYearConfigs', configId), configData);

      setSuccess('Division added successfully!');
      fetchData();
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError('Failed to add division.');
    }
  };

  const handleAddTeacher = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const teacherId = formData.get('teacherId') as string;
    let password = formData.get('password') as string;
    const role = formData.get('role') as string || 'teacher';

    if (!password) {
      password = 'Pass@123';
    }

    if (!appUser || !name || !teacherId) return;

    try {
      const loginEmail = `${teacherId}@attendify.com`;
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, loginEmail, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        uid,
        schoolId: appUser.schoolId,
        role,
        name,
        teacherId,
        status: 'active',
        firstLogin: true
      });

      // Sign out from secondary app to avoid session conflicts
      await secondaryAuth.signOut();

      setSuccess('Teacher account created!');
      fetchData();
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError(`Teacher ID "${teacherId}" is already registered. Please use a unique ID.`);
      } else {
        setError(err.message || 'Failed to create teacher account.');
      }
    }
  };

  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const admissionNumber = formData.get('admissionNumber') as string;
    const admissionDate = formData.get('admissionDate') as string;
    const classId = formData.get('classId') as string;
    const divisionId = formData.get('divisionId') as string;

    if (!appUser || !name || !admissionNumber || !admissionDate || !classId || !divisionId) return;

    try {
      const studentId = `STU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await setDoc(doc(db, 'students', studentId), {
        studentId,
        schoolId: appUser.schoolId,
        classId,
        divisionId,
        name,
        admissionNumber,
        status: 'active',
        admissionDate,
        classHistory: [{ classId, divisionId, startDate: admissionDate }]
      });
      setSuccess('Student added successfully!');
      setSelectedClassForStudent('');
      fetchData();
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError('Failed to add student.');
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !appUser) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const batch = writeBatch(db);
        let count = 0;
        let skipped = 0;

        results.data.forEach((row: any) => {
          if (!row.name || !row.admissionNumber || !row.className || !row.divisionName || !row.admissionDate) {
            skipped++;
            return;
          }

          // Find class by name (case-insensitive)
          const targetClass = classes.find(c => c.name.toLowerCase() === row.className.trim().toLowerCase());
          if (!targetClass) {
            skipped++;
            return;
          }

          // Find division by name within that class (case-insensitive)
          const targetDivision = divisions.find(d => 
            d.classId === targetClass.classId && 
            d.name.toLowerCase() === row.divisionName.trim().toLowerCase()
          );

          if (!targetDivision) {
            skipped++;
            return;
          }

          // Parse DD-MM-YYYY to YYYY-MM-DD
          const dateParts = row.admissionDate.trim().split('-');
          if (dateParts.length !== 3) {
            skipped++;
            return;
          }
          const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

          const studentId = `STU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          const studentRef = doc(db, 'students', studentId);
          batch.set(studentRef, {
            studentId,
            schoolId: appUser.schoolId,
            classId: targetClass.classId,
            divisionId: targetDivision.divisionId,
            name: row.name,
            admissionNumber: row.admissionNumber,
            status: 'active',
            admissionDate: formattedDate,
            classHistory: [{ classId: targetClass.classId, divisionId: targetDivision.divisionId, startDate: formattedDate }]
          });
          count++;
        });

        if (count > 0) {
          try {
            await batch.commit();
            setSuccess(`Successfully uploaded ${count} students!${skipped > 0 ? ` (${skipped} rows skipped due to invalid data)` : ''}`);
            fetchData();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, 'bulk_student_upload');
            setError('Failed to commit bulk upload.');
          }
        } else if (skipped > 0) {
          setError(`Failed to upload students. ${skipped} rows had invalid class/division names or missing data.`);
        }
      }
    });
  };

  const handlePromoteStudents = async (promoteAll: boolean) => {
    const promotionDate = (document.getElementById('promotionDate') as HTMLInputElement).value;
    if (!fromDivisionId || !selectedToClassForPromotion || !selectedToDivisionForPromotion || !promotionDate) {
      setError('Please select all promotion details and date.');
      return;
    }

    try {
      const studentsToPromote = promoteAll 
        ? students.filter(s => s.divisionId === fromDivisionId)
        : students.filter(s => selectedStudentsForPromotion.has(s.studentId));

      if (studentsToPromote.length === 0) {
        setError('No students selected for promotion.');
        return;
      }

      const batch = writeBatch(db);
      studentsToPromote.forEach(s => {
        const studentRef = doc(db, 'students', s.studentId);
        const newClassHistory = [...(s.classHistory || [])];
        const lastHistory = newClassHistory[newClassHistory.length - 1];
        if (lastHistory) {
          lastHistory.endDate = promotionDate;
        }
        newClassHistory.push({
          classId: selectedToClassForPromotion,
          divisionId: selectedToDivisionForPromotion,
          startDate: promotionDate
        });
        batch.update(studentRef, {
          classId: selectedToClassForPromotion,
          divisionId: selectedToDivisionForPromotion,
          promotionDate: promotionDate,
          classHistory: newClassHistory
        });
      });
      await batch.commit();
      setSuccess(`Promoted ${studentsToPromote.length} students!`);
      setSelectedToClassForPromotion('');
      setSelectedToDivisionForPromotion('');
      setSelectedStudentsForPromotion(new Set());
      setFromDivisionId('');
      fetchData();
    } catch (err) {
      setError('Promotion failed.');
    }
  };

  const handlePassOutStudents = async () => {
    const passoutDate = (document.getElementById('passoutDate') as HTMLInputElement).value;
    if (selectedStudentsForPassOut.size === 0 || !passoutDate) {
      setError('Please select students and a pass-out date.');
      return;
    }
    try {
      const batch = writeBatch(db);
      selectedStudentsForPassOut.forEach(studentId => {
        const studentRef = doc(db, 'students', studentId);
        batch.update(studentRef, { status: 'pass-out', passoutDate });
      });
      await batch.commit();
      setSuccess(`Marked ${selectedStudentsForPassOut.size} students as pass-out!`);
      setSelectedStudentsForPassOut(new Set());
      fetchData();
    } catch(err) {
      setError('Failed to mark students as pass-out.');
    }
  };

  const handlePassOut = async (studentId: string, passoutDate: string) => {
    try {
      await updateDoc(doc(db, 'students', studentId), { status: 'pass-out', passoutDate });
      setSuccess('Student marked as pass-out.');
      fetchData();
    } catch (err) {
      setError('Failed to update student status.');
    }
  };

  const handleTerminateStudent = async (studentId: string, terminationDate: string, terminationReason: string) => {
    try {
      await updateDoc(doc(db, 'students', studentId), { status: 'terminated', terminationDate, terminationReason });
      setSuccess('Student marked as terminated.');
      fetchData();
    } catch (err) {
      setError('Failed to update student status.');
    }
  };

  const handleUpdateTeacherRole = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setSuccess('Teacher role updated successfully');
      fetchData();
    } catch (err) {
      setError('Failed to update teacher role');
    }
  };

  const handleUpdateDivisionTeacher = async (divisionId: string, teacherId: string) => {
    try {
      const configId = `${appUser!.schoolId}_${academicYear}_${divisionId}`;
      await setDoc(doc(db, 'academicYearConfigs', configId), {
        configId,
        schoolId: appUser!.schoolId,
        academicYear,
        divisionId,
        teacherId
      }, { merge: true });
      setSuccess('Division teacher updated successfully');
      fetchData();
    } catch (err) {
      setError('Failed to update division teacher');
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetModal.teacher) return;

    const formData = new FormData(e.currentTarget);
    let newPassword = formData.get('newPassword') as string;

    if (!newPassword) newPassword = 'Pass@123';

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: resetModal.teacher.uid,
          newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Password reset successfully for ${resetModal.teacher.name}`);
        setResetModal({ show: false, teacher: null });
        fetchData();
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const type = formData.get('type') as 'holiday' | 'working_saturday';
    const reason = formData.get('reason') as string;

    if (!appUser || !date || !type) return;

    try {
      const holidayId = `${appUser.schoolId}_${date}`;
      await setDoc(doc(db, 'holidays', holidayId), {
        holidayId,
        schoolId: appUser.schoolId,
        date,
        type,
        reason
      });
      setSuccess('Holiday record updated!');
      fetchData();
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError('Failed to add holiday.');
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      await deleteDoc(doc(db, 'holidays', holidayId));
      setSuccess('Holiday record deleted.');
      fetchData();
    } catch (err) {
      setError('Failed to delete holiday.');
    }
  };

  const filteredStudents = students.filter(s => {
    if (studentFilterClass && s.displayClassId !== studentFilterClass) return false;
    if (studentFilterDivision && s.displayDivisionId !== studentFilterDivision) return false;
    return true;
  }).sort((a, b) => {
    const classA = classes.find(c => c.classId === a.displayClassId)?.name || "";
    const classB = classes.find(c => c.classId === b.displayClassId)?.name || "";
    if (classA !== classB) {
        return classA.localeCompare(classB);
    }

    const divA = divisions.find(d => d.divisionId === a.displayDivisionId)?.name || "";
    const divB = divisions.find(d => d.divisionId === b.displayDivisionId)?.name || "";
    if (divA !== divB) {
        return divA.localeCompare(divB);
    }

    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">School Management</h1>
          <p className="text-gray-500 mt-1">Configure classes, teachers, and student records.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100 w-fit">
        {[
          { id: 'classes', label: 'Classes & Divisions', icon: BookOpen },
          { id: 'teachers', label: 'Teachers', icon: UserPlus },
          { id: 'students', label: 'Students', icon: Users },
          { id: 'promotion', label: 'Promotion', icon: GraduationCap },
          { id: 'holidays', label: 'Holidays', icon: Calendar },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition-colors p-1 hover:bg-red-100 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-green-700 font-medium">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-600 transition-colors p-1 hover:bg-green-100 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Forms */}
        <div className="lg:col-span-1 space-y-8">
          {activeTab === 'classes' && (
            <>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Class</h3>
                <form onSubmit={handleAddClass} className="space-y-4">
                  <input
                    name="name"
                    required
                    placeholder="e.g., Grade 1"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    name="startDate"
                    type="date"
                    required
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" /> Add Class
                  </button>
                </form>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Division</h3>
                <form onSubmit={handleAddDivision} className="space-y-4">
                  <select name="classId" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                  </select>
                  <input name="name" required placeholder="e.g., A" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  <select name="teacherId" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Assign Teacher (Optional)</option>
                    {teachers.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
                  </select>
                  <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" /> Add Division
                  </button>
                </form>
              </div>
            </>
          )}

          {activeTab === 'teachers' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">Create Teacher Account</h3>
              <form onSubmit={handleAddTeacher} className="space-y-4">
                <input name="name" required placeholder="Full Name" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                <input name="teacherId" required placeholder="Teacher ID (Login ID)" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                <input name="password" type="password" placeholder="Password (Default: Pass@123)" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                <select name="role" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="teacher">Teacher</option>
                  <option value="it_coordinator">IT Coordinator</option>
                </select>
                <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" /> Create Account
                </button>
              </form>
            </div>
          )}

          {activeTab === 'students' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Add Student</h3>
                <form onSubmit={handleAddStudent} className="space-y-4">
                  <input name="name" required placeholder="Student Full Name" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  <input name="admissionNumber" required placeholder="Admission Number" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  <input name="admissionDate" type="date" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  <select 
                    name="classId" 
                    required 
                    value={selectedClassForStudent}
                    onChange={(e) => setSelectedClassForStudent(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                  </select>
                  <select name="divisionId" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Select Division</option>
                    {divisions
                      .filter(d => !selectedClassForStudent || d.classId === selectedClassForStudent)
                      .map(d => (
                        <option key={d.divisionId} value={d.divisionId}>
                          {classes.find(c => c.classId === d.classId)?.name} - {d.name}
                        </option>
                      ))}
                  </select>
                  <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" /> Add Student
                  </button>
                </form>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Bulk Upload Students</h3>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer relative">
                  <input type="file" accept=".csv" onChange={handleCsvUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <FileSpreadsheet className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-900">Click to upload CSV</p>
                  <p className="text-xs text-gray-500 mt-1">Format: name, admissionNumber, className, divisionName, admissionDate (DD-MM-YYYY)</p>
                </div>
                <button
                  onClick={() => {
                    const csvContent = "name,admissionNumber,className,divisionName,admissionDate\nJohn Doe,A123,Grade 1,A,31-12-2025";
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'student_sample.csv';
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="mt-4 w-full text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Download Sample CSV
                </button>
              </div>
            </div>
          )}

          {activeTab === 'promotion' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Promote Cohort</h3>
                <div className="space-y-4">
                  <select 
                    value={fromDivisionId}
                    onChange={(e) => {
                      setFromDivisionId(e.target.value);
                      setSelectedStudentsForPromotion(new Set());
                    }}
                    required 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">From Division</option>
                    {divisions.map(d => <option key={d.divisionId} value={d.divisionId}>{classes.find(c => c.classId === d.classId)?.name} - {d.name}</option>)}
                  </select>

                  <input id="promotionDate" type="date" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />

                  {fromDivisionId && (
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                      {students.filter(s => s.divisionId === fromDivisionId).map(s => (
                        <label key={s.studentId} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={selectedStudentsForPromotion.has(s.studentId)}
                            onChange={(e) => {
                              const next = new Set(selectedStudentsForPromotion);
                              if (e.target.checked) next.add(s.studentId);
                              else next.delete(s.studentId);
                              setSelectedStudentsForPromotion(next);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-center py-2">
                    <ArrowRight className="h-6 w-6 text-gray-300" />
                  </div>
                  <select 
                    value={selectedToClassForPromotion}
                    onChange={(e) => setSelectedToClassForPromotion(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">To Class</option>
                    {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                  </select>
                  <select 
                    value={selectedToDivisionForPromotion}
                    onChange={(e) => setSelectedToDivisionForPromotion(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">To Division</option>
                    {divisions
                      .filter(d => !selectedToClassForPromotion || d.classId === selectedToClassForPromotion)
                      .map(d => (
                        <option key={d.divisionId} value={d.divisionId}>
                          {classes.find(c => c.classId === d.classId)?.name} - {d.name}
                        </option>
                      ))}
                  </select>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => handlePromoteStudents(false)}
                      className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      Promote Selected
                    </button>
                    <button 
                      type="button"
                      onClick={() => handlePromoteStudents(true)}
                      className="flex-1 bg-blue-100 text-blue-700 py-2.5 rounded-xl font-bold hover:bg-blue-200 transition-all flex items-center justify-center gap-2"
                    >
                      Promote All
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Pass-out Cohort</h3>
                <div className="space-y-4">
                  <select 
                    value={fromDivisionId}
                    onChange={(e) => {
                      setFromDivisionId(e.target.value);
                      setSelectedStudentsForPassOut(new Set());
                    }}
                    required 
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select Division</option>
                    {divisions.map(d => <option key={d.divisionId} value={d.divisionId}>{classes.find(c => c.classId === d.classId)?.name} - {d.name}</option>)}
                  </select>

                  <input id="passoutDate" type="date" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />

                  {fromDivisionId && (
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1">
                      {students.filter(s => s.divisionId === fromDivisionId).map(s => (
                        <label key={s.studentId} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={selectedStudentsForPassOut.has(s.studentId)}
                            onChange={(e) => {
                              const next = new Set(selectedStudentsForPassOut);
                              if (e.target.checked) next.add(s.studentId);
                              else next.delete(s.studentId);
                              setSelectedStudentsForPassOut(next);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <button 
                    type="button"
                    onClick={handlePassOutStudents}
                    className="w-full bg-orange-600 text-white py-2.5 rounded-xl font-bold hover:bg-orange-700 transition-all flex items-center justify-center gap-2"
                  >
                    Mark Pass-out
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'holidays' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Mark Holiday / Working Day</h3>
              <form onSubmit={handleAddHoliday} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 ml-1">Date</label>
                  <input type="hidden" name="date" value={selectedHolidayDate} />
                  <button
                    type="button"
                    onClick={() => setDatePickerModal({ show: true })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none flex items-center justify-between text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    {format(parseISO(selectedHolidayDate), 'MMMM do, yyyy')}
                    <Calendar className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 ml-1">Type</label>
                  <select name="type" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="holiday">Holiday</option>
                    <option value="working_saturday">Working Saturday</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 ml-1">Reason (Optional)</label>
                  <input name="reason" placeholder="e.g., Diwali, Sports Day" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Save className="h-4 w-4" /> Save Record
                </button>
              </form>
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Note:</strong> Sundays and Saturdays are holidays by default. Use "Working Saturday" to override a specific Saturday.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Lists */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {activeTab === 'classes' && 'Classes & Divisions'}
                {activeTab === 'teachers' && 'Teacher Accounts'}
                {activeTab === 'students' && 'Active Students'}
                {activeTab === 'promotion' && 'Promotion History'}
                {activeTab === 'holidays' && 'Holiday Records'}
              </h3>
              {activeTab === 'students' && (
                <div className="flex items-center gap-2">
                  <select 
                    value={studentFilterClass}
                    onChange={(e) => {
                      setStudentFilterClass(e.target.value);
                      setStudentFilterDivision('');
                    }}
                    className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                  </select>
                  <select 
                    value={studentFilterDivision}
                    onChange={(e) => setStudentFilterDivision(e.target.value)}
                    className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Divisions</option>
                    {divisions
                      .filter(d => !studentFilterClass || d.classId === studentFilterClass)
                      .map(d => <option key={d.divisionId} value={d.divisionId}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {activeTab === 'classes' && classes.map(cls => (
                <div key={cls.classId} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-900 text-lg">{cls.name}</h4>
                    <div className="flex items-center gap-2">
                      {editingStartDate?.classId === cls.classId ? (
                        <div className="flex items-center gap-2">
                          <input 
                            type="date" 
                            value={editingStartDate.date}
                            onChange={(e) => setEditingStartDate({...editingStartDate, date: e.target.value})}
                            className="text-xs border border-gray-300 rounded p-1"
                          />
                          <button onClick={async () => {
                            try {
                              const configId = `${appUser!.schoolId}_${academicYear}_${cls.classId}`;
                              await setDoc(doc(db, 'academicYearConfigs', configId), {
                                configId,
                                schoolId: appUser!.schoolId,
                                academicYear,
                                classId: cls.classId,
                                startDate: editingStartDate.date
                              }, { merge: true });
                              setSuccess('Start date updated');
                              fetchData();
                              setEditingStartDate(null);
                            } catch (err) {
                              setError('Failed to update start date');
                            }
                          }} className="text-green-500 hover:bg-green-50 p-2 rounded-lg transition-colors">
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingStartDate(null)} className="text-gray-500 hover:bg-gray-50 p-2 rounded-lg transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingStartDate({ classId: cls.classId, date: cls.startDate || '' })} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors">
                          <Calendar className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => {
                        setConfirmModal({
                          show: true,
                          title: 'Delete Class',
                          message: `Are you sure you want to delete ${cls.name} and all its divisions? This action cannot be undone.`,
                          onConfirm: async () => {
                            try {
                              await deleteDoc(doc(db, 'classes', cls.classId));
                              setSuccess('Class deleted successfully');
                              fetchData();
                            } catch (err) {
                              setError('Failed to delete class');
                            }
                            setConfirmModal(prev => ({ ...prev, show: false }));
                          }
                        });
                      }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {divisions.filter(d => d.classId === cls.classId).map(div => (
                      <div key={div.divisionId} className="bg-gray-50 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">Division {div.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">Teacher:</p>
                            <select
                              value={div.teacherId || ''}
                              onChange={(e) => handleUpdateDivisionTeacher(div.divisionId, e.target.value)}
                              className="text-xs bg-transparent border-none focus:ring-0 p-0 font-medium text-blue-600 cursor-pointer hover:underline"
                            >
                              <option value="">Unassigned</option>
                              {teachers.map(t => (
                                <option key={t.uid} value={t.uid}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button onClick={() => {
                          setConfirmModal({
                            show: true,
                            title: 'Delete Division',
                            message: `Are you sure you want to delete Division ${div.name}?`,
                            onConfirm: async () => {
                              try {
                                await deleteDoc(doc(db, 'divisions', div.divisionId));
                                setSuccess('Division deleted successfully');
                                fetchData();
                              } catch (err) {
                                setError('Failed to delete division');
                              }
                              setConfirmModal(prev => ({ ...prev, show: false }));
                            }
                          });
                        }} className="text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {activeTab === 'teachers' && teachers.map(teacher => (
                <div key={teacher.uid} className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold">
                      {teacher.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{teacher.name}</p>
                        {teacher.role === 'it_coordinator' && (
                          <span title="IT Coordinator">
                            <ShieldCheck className="h-4 w-4 text-blue-600" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">ID: {teacher.teacherId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <select
                      value={teacher.role}
                      onChange={(e) => handleUpdateTeacherRole(teacher.uid, e.target.value)}
                      className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="it_coordinator">IT Coordinator</option>
                    </select>
                    <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${teacher.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {teacher.status}
                    </span>
                    <button 
                      onClick={() => setResetModal({ show: true, teacher })}
                      className="text-gray-400 hover:text-blue-600 p-2 transition-colors"
                      title="Reset Password"
                    >
                      <UserCog className="h-4 w-4" />
                    </button>
                    <button onClick={() => {
                      setConfirmModal({
                        show: true,
                        title: 'Delete Teacher',
                        message: `Are you sure you want to delete the account for ${teacher.name}? They will lose all access to the system.`,
                        onConfirm: async () => {
                          setLoading(true);
                          try {
                            const response = await fetch('/api/delete-user', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ uid: teacher.uid }),
                            });

                            const data = await response.json();

                            if (data.success) {
                              setSuccess('Teacher account and data deleted successfully');
                              fetchData();
                            } else {
                              setError(data.error || 'Failed to delete teacher account');
                            }
                          } catch (err) {
                            setError('Failed to connect to the server');
                          } finally {
                            setLoading(false);
                          }
                          setConfirmModal(prev => ({ ...prev, show: false }));
                        }
                      });
                    }} className="text-gray-400 hover:text-red-500 p-2 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

              {activeTab === 'students' && filteredStudents.map(student => (
                <div key={student.studentId} className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <p 
                        className="font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => setCalendarModal({ show: true, student })}
                      >
                        {student.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {classes.find(c => c.classId === student.displayClassId)?.name} - {divisions.find(d => d.divisionId === student.displayDivisionId)?.name} | ID: {student.admissionNumber}
                      </p>
                      {student.status === 'terminated' && (
                        <p className="text-xs text-red-600 font-bold mt-1">
                          Removed from the roll as on {student.terminationDate} due to {student.terminationReason}
                        </p>
                      )}
                    </div>
                  </div>
                  {student.status !== 'terminated' && (
                    <button
                      onClick={() => setStudentActionModal({ show: true, student, action: 'terminate' })}
                      className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Terminate
                    </button>
                  )}
                </div>
              ))}

              {activeTab === 'holidays' && holidays.sort((a, b) => b.date.localeCompare(a.date)).map(holiday => (
                <div key={holiday.holidayId} className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${holiday.type === 'holiday' ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{format(parseISO(holiday.date), 'MMMM do, yyyy')}</p>
                      <p className="text-xs text-gray-500">
                        {holiday.type === 'holiday' ? 'Holiday' : 'Working Saturday'} {holiday.reason && `| ${holiday.reason}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteHoliday(holiday.holidayId)}
                    className="text-gray-400 hover:text-red-500 p-2 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {((activeTab === 'classes' && classes.length === 0) || 
                (activeTab === 'teachers' && teachers.length === 0) || 
                (activeTab === 'students' && filteredStudents.length === 0) ||
                (activeTab === 'holidays' && holidays.length === 0)) && (
                <div className="p-12 text-center text-gray-500">
                  No records found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {resetModal.show && resetModal.teacher && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-blue-600 mb-4">
              <UserCog className="h-6 w-6" />
              <h3 className="text-xl font-bold">Reset Password</h3>
            </div>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Set a new default password for <strong>{resetModal.teacher.name}</strong>. They will be required to change it on their next login.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <input
                name="newPassword"
                type="password"
                placeholder="New Default Password (default: Pass@123)"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetModal({ show: false, teacher: null })}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-xl font-bold">{confirmModal.title}</h3>
            </div>
            <p className="text-gray-600 mb-8 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Action Modal */}
      {studentActionModal.show && studentActionModal.student && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {studentActionModal.action === 'pass-out' ? 'Mark Pass-out' : 'Terminate Student'}
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const date = formData.get('date') as string;
              if (studentActionModal.action === 'pass-out') {
                handlePassOut(studentActionModal.student!.studentId, date);
              } else {
                const reason = formData.get('reason') as string;
                handleTerminateStudent(studentActionModal.student!.studentId, date, reason);
              }
              setStudentActionModal({ show: false, student: null, action: null });
            }} className="space-y-4">
              <input name="date" type="date" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              {studentActionModal.action === 'terminate' && (
                <input name="reason" required placeholder="Reason for termination" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setStudentActionModal({ show: false, student: null, action: null })} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {calendarModal.show && calendarModal.student && (
        <AttendanceCalendar
          student={calendarModal.student}
          className={classes.find(c => c.classId === (calendarModal.student as any).displayClassId)?.name || 'Unknown'}
          divisionName={divisions.find(d => d.divisionId === (calendarModal.student as any).displayDivisionId)?.name || 'Unknown'}
          onClose={() => setCalendarModal({ show: false, student: null })}
        />
      )}
      {datePickerModal.show && (
        <DatePickerModal
          selectedDate={selectedHolidayDate}
          onSelectDate={(date) => {
            setSelectedHolidayDate(date);
            setDatePickerModal({ show: false });
          }}
          onClose={() => setDatePickerModal({ show: false })}
          holidays={holidays}
        />
      )}
    </div>
  );
};
