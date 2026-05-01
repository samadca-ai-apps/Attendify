import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, ShieldCheck, UserCog, Save, CheckCircle2, AlertCircle, X, Trash2 } from 'lucide-react';

export const Settings: React.FC = () => {
  const { appUser, school } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [email, setEmail] = useState('');
  const [handoverTeacherId, setHandoverTeacherId] = useState('');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectStudentsForDeletion, setSelectStudentsForDeletion] = useState(false);
  const [showConfirmDeleteSelected, setShowConfirmDeleteSelected] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (school) {
      setSchoolName(school.name);
      setEmail(school.email || '');
      setLoading(false);
    }
    const fetchData = async () => {
      if (!appUser) return;
      const [classesSnap, divisionsSnap, studentsSnap, teachersSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'), where('schoolId', '==', appUser.schoolId))),
        getDocs(query(collection(db, 'divisions'), where('schoolId', '==', appUser.schoolId))),
        getDocs(query(collection(db, 'students'), where('schoolId', '==', appUser.schoolId))),
        getDocs(query(collection(db, 'users'), where('schoolId', '==', appUser.schoolId), where('role', '==', 'teacher')))
      ]);
      setClasses(classesSnap.docs.map(d => d.data()));
      setDivisions(divisionsSnap.docs.map(d => d.data()));
      setStudents(studentsSnap.docs.map(d => d.data()));
      setTeachers(teachersSnap.docs.map(d => d.data()));
    };
    fetchData();
  }, [school, appUser]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!appUser || !schoolName) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateDoc(doc(db, 'schools', appUser.schoolId), {
        name: schoolName,
        email: email
      });
      // Handle handover logic if handoverTeacherId is set
      if (handoverTeacherId) {
        // Implement handover logic here
        console.log('Handover charge to:', handoverTeacherId);
      }
      setSuccessMessage('Settings updated successfully!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'school_settings');
      setError('Failed to update school settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllStudents = async () => {
    if (!appUser) return;
    setSaving(true);
    setError(null);
    try {
      const studentsSnap = await getDocs(query(collection(db, 'students'), where('schoolId', '==', appUser.schoolId)));
      const batch = writeBatch(db);
      studentsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      setSuccessMessage('All students deleted permanently.');
      setShowSuccessPopup(true);
      setConfirmDelete(false);
      setStudents([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'delete_all_students');
      setError('Failed to delete students.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelectedStudents = async () => {
    if (!appUser || selectedStudentIds.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      selectedStudentIds.forEach(studentId => {
        batch.delete(doc(db, 'students', studentId));
      });
      await batch.commit();
      setSuccessMessage('Selected students deleted permanently.');
      setShowSuccessPopup(true);
      setSelectStudentsForDeletion(false);
      setStudents(prev => prev.filter(s => !selectedStudentIds.has(s.studentId)));
      setSelectedStudentIds(new Set());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'delete_selected_students');
      setError('Failed to delete selected students.');
    } finally {
      setSaving(false);
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
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
        <p className="text-gray-500 mt-1">Configure your school profile and system preferences.</p>
      </div>

      {showSuccessPopup && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in duration-200 text-center">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Success</h3>
            <p className="text-gray-600 mb-6">{successMessage}</p>
            <button
              onClick={() => setShowSuccessPopup(false)}
              className="w-full px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-green-700 font-medium">{successMessage}</p>
          </div>
          <button onClick={() => setSuccess(false)} className="text-green-400 hover:text-green-600 transition-colors p-1 hover:bg-green-100 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
          <SettingsIcon className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-gray-900">School Profile</h2>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">School Name</label>
            <input 
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Enter school name"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Official Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Enter official email"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">School ID</label>
            <input 
              type="text"
              value={appUser?.schoolId}
              disabled
              className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 italic">School ID is a unique identifier and cannot be changed.</p>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
          <UserCog className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-gray-900">Handover Charge</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">New Head of School</label>
            <select 
              value={handoverTeacherId}
              onChange={(e) => setHandoverTeacherId(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select New Head of School</option>
              {teachers.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
            </select>
          </div>
          <button
              onClick={() => handleSave()}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Save Handover
                </>
              )}
            </button>
        </div>
      </div>

      {appUser?.role === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
          <div className="p-6 border-b border-red-100 bg-red-50/50 flex items-center gap-3">
            <Trash2 className="h-5 w-5 text-red-600" />
            <h2 className="font-bold text-gray-900">Danger Zone</h2>
          </div>
          <div className="p-6 space-y-4">
            <button
              onClick={() => setConfirmDelete(true)}
              disabled
              className="w-full bg-gray-400 text-white py-3 rounded-xl font-bold cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Trash2 className="h-5 w-5" />
              Delete All Students (Disabled)
            </button>
            <button
              onClick={() => {
                setSelectStudentsForDeletion(true);
                setConfirmDelete(false);
              }}
              className="w-full bg-red-100 text-red-700 py-3 rounded-xl font-bold hover:bg-red-200 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="h-5 w-5" />
              Delete Selected Students
            </button>
          </div>
        </div>
      )}

      {selectStudentsForDeletion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Delete Selected Students</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedDivisionId('');
                  setSelectedStudentIds(new Set());
                }}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select Class</option>
                {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
              </select>
              <select
                value={selectedDivisionId}
                onChange={(e) => {
                  setSelectedDivisionId(e.target.value);
                  setSelectedStudentIds(new Set());
                }}
                disabled={!selectedClassId}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select Division</option>
                {divisions.filter(d => d.classId === selectedClassId).map(d => <option key={d.divisionId} value={d.divisionId}>{d.name}</option>)}
              </select>
            </div>
            {selectedDivisionId && (
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-1 mb-4">
                {students.filter(s => s.divisionId === selectedDivisionId).map(s => (
                  <label key={s.studentId} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.has(s.studentId)}
                      onChange={(e) => {
                        const next = new Set(selectedStudentIds);
                        if (e.target.checked) next.add(s.studentId);
                        else next.delete(s.studentId);
                        setSelectedStudentIds(next);
                      }}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    {s.name} ({s.admissionNumber})
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setSelectStudentsForDeletion(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowConfirmDeleteSelected(true)}
                disabled={saving || selectedStudentIds.size === 0}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50"
              >
                Delete {selectedStudentIds.size} Students
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmDeleteSelected && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-gray-600 mb-8">Are you sure you want to permanently delete the {selectedStudentIds.size} selected students? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDeleteSelected(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteSelectedStudents();
                  setShowConfirmDeleteSelected(false);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-gray-900">Security & Access</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <UserCog className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-bold text-gray-900">Role-Based Access</p>
                <p className="text-xs text-gray-500">Manage permissions for different user roles.</p>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">Enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
};
