import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, setDoc, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth, secondaryAuth, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Class, Division, User, Student, Holiday } from '../types';
import { Plus, Trash2, UserPlus, Upload, Download, GraduationCap, ArrowRight, CheckCircle2, AlertCircle, FileSpreadsheet, BookOpen, Users, X, ShieldCheck, UserCog, Calendar, Save } from 'lucide-react';
import Papa from 'papaparse';
import { format, parseISO } from 'date-fns';

export const Management: React.FC = () => {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'classes' | 'teachers' | 'students' | 'promotion' | 'holidays'>('classes');
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedClassForStudent, setSelectedClassForStudent] = useState<string>('');
  const [selectedToClassForPromotion, setSelectedToClassForPromotion] = useState<string>('');
  
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

  const fetchData = async () => {
    if (!appUser) return;
    setLoading(true);
    try {
      const schoolId = appUser.schoolId;
      
      const [classesSnap, divisionsSnap, teachersSnap, studentsSnap, holidaysSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'divisions'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', 'in', ['teacher', 'it_coordinator']))),
        getDocs(query(collection(db, 'students'), where('schoolId', '==', schoolId), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'holidays'), where('schoolId', '==', schoolId)))
      ]);

      setClasses(classesSnap.docs.map(doc => doc.data() as Class));
      setDivisions(divisionsSnap.docs.map(doc => doc.data() as Division));
      setTeachers(teachersSnap.docs.map(doc => doc.data() as User));
      setStudents(studentsSnap.docs.map(doc => doc.data() as Student));
      setHolidays(holidaysSnap.docs.map(doc => doc.data() as Holiday));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'management_fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [appUser]);

  const handleAddClass = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name') as string;
    if (!appUser || !name) return;

    try {
      const classId = `CLS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await setDoc(doc(db, 'classes', classId), {
        classId,
        schoolId: appUser.schoolId,
        name
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
      const divisionData: any = {
        divisionId,
        schoolId: appUser.schoolId,
        classId,
        name,
      };
      if (teacherId) divisionData.teacherId = teacherId;

      await setDoc(doc(db, 'divisions', divisionId), divisionData);
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
    const classId = formData.get('classId') as string;
    const divisionId = formData.get('divisionId') as string;

    if (!appUser || !name || !admissionNumber || !classId || !divisionId) return;

    try {
      const studentId = `STU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await setDoc(doc(db, 'students', studentId), {
        studentId,
        schoolId: appUser.schoolId,
        classId,
        divisionId,
        name,
        admissionNumber,
        status: 'active'
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
          if (!row.name || !row.admissionNumber || !row.className || !row.divisionName) {
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

          const studentId = `STU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          const studentRef = doc(db, 'students', studentId);
          batch.set(studentRef, {
            studentId,
            schoolId: appUser.schoolId,
            classId: targetClass.classId,
            divisionId: targetDivision.divisionId,
            name: row.name,
            admissionNumber: row.admissionNumber,
            status: 'active'
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

  const handlePromoteStudents = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fromDivisionId = formData.get('fromDivisionId') as string;
    const toClassId = formData.get('toClassId') as string;
    const toDivisionId = formData.get('toDivisionId') as string;
    if (!fromDivisionId || !toClassId || !toDivisionId) return;

    try {
      const studentsToPromote = students.filter(s => s.divisionId === fromDivisionId);
      const batch = writeBatch(db);
      studentsToPromote.forEach(s => {
        const studentRef = doc(db, 'students', s.studentId);
        batch.update(studentRef, {
          classId: toClassId,
          divisionId: toDivisionId
        });
      });
      await batch.commit();
      setSuccess(`Promoted ${studentsToPromote.length} students!`);
      setSelectedToClassForPromotion('');
      fetchData();
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError('Promotion failed.');
    }
  };

  const handlePassOut = async (studentId: string) => {
    try {
      await updateDoc(doc(db, 'students', studentId), { status: 'pass-out' });
      setSuccess('Student marked as pass-out.');
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
      await updateDoc(doc(db, 'divisions', divisionId), { teacherId });
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
    const newPassword = formData.get('newPassword') as string;

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
    if (studentFilterClass && s.classId !== studentFilterClass) return false;
    if (studentFilterDivision && s.divisionId !== studentFilterDivision) return false;
    return true;
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
                  <p className="text-xs text-gray-500 mt-1">Format: name, admissionNumber, className, divisionName</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'promotion' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Promote Cohort</h3>
              <form onSubmit={handlePromoteStudents} className="space-y-4">
                <select name="fromDivisionId" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">From Division</option>
                  {divisions.map(d => <option key={d.divisionId} value={d.divisionId}>{classes.find(c => c.classId === d.classId)?.name} - {d.name}</option>)}
                </select>
                <div className="flex justify-center py-2">
                  <ArrowRight className="h-6 w-6 text-gray-300" />
                </div>
                <select 
                  name="toClassId" 
                  required 
                  value={selectedToClassForPromotion}
                  onChange={(e) => setSelectedToClassForPromotion(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">To Class</option>
                  {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
                </select>
                <select name="toDivisionId" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">To Division</option>
                  {divisions
                    .filter(d => !selectedToClassForPromotion || d.classId === selectedToClassForPromotion)
                    .map(d => (
                      <option key={d.divisionId} value={d.divisionId}>
                        {classes.find(c => c.classId === d.classId)?.name} - {d.name}
                      </option>
                    ))}
                </select>
                <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <GraduationCap className="h-4 w-4" /> Promote Students
                </button>
              </form>
            </div>
          )}

          {activeTab === 'holidays' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Mark Holiday / Working Day</h3>
              <form onSubmit={handleAddHoliday} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 ml-1">Date</label>
                  <input name="date" type="date" required className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
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
                      <p className="font-bold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-500">
                        {classes.find(c => c.classId === student.classId)?.name} - {divisions.find(d => d.divisionId === student.divisionId)?.name} | ID: {student.admissionNumber}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePassOut(student.studentId)}
                    className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    Mark Pass-out
                  </button>
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
                required
                placeholder="New Default Password"
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
    </div>
  );
};
