import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAcademicYear } from '../contexts/AcademicYearContext';
import { Student, Class, Division, AcademicYearConfig } from '../types';
import { Search, FileDown, BookOpen, User, Calendar, GraduationCap, X, SlidersHorizontal } from 'lucide-react';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { format, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const StudentsPage: React.FC = () => {
  const { appUser, school } = useAuth();
  const { academicYear, academicYears } = useAcademicYear();

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentForCalendar, setSelectedStudentForCalendar] = useState<Student | null>(null);

  // Stats for the active division
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!appUser) return;

    const fetchConfiguredClassesAndDivisions = async () => {
      setLoading(true);
      try {
        const schoolId = appUser.schoolId;

        // 1. Fetch AcademicYearConfigs for current school and selected academic year
        const configsSnap = await getDocs(
          query(collection(db, 'academicYearConfigs'), where('schoolId', '==', schoolId), where('academicYear', '==', academicYear))
        );
        const configs = configsSnap.docs.map(doc => doc.data() as AcademicYearConfig);

        // 2. Fetch Classes
        const classesSnap = await getDocs(query(collection(db, 'classes'), where('schoolId', '==', schoolId)));
        const classesDataRaw = classesSnap.docs.map(doc => doc.data() as Class);

        // Filter and merge class dates from config
        const classesData = classesDataRaw.map(cls => {
          const config = configs.find(c => c.classId === cls.classId && !c.divisionId);
          return { ...cls, startDate: config?.startDate || cls.startDate };
        });
        setClasses(classesData);

        // 3. Fetch Divisions (irrespective of teacher assignment, i.e., fetching all divisions for this school in this year)
        const divisionsSnap = await getDocs(query(collection(db, 'divisions'), where('schoolId', '==', schoolId)));
        let divisionsData = divisionsSnap.docs.map(doc => doc.data() as Division);

        // Filter divisions that are configured for this academic year
        divisionsData = divisionsData.filter(d => 
          configs.some(c => c.divisionId === d.divisionId)
        );
        setDivisions(divisionsData);

        // Select the default first class and division if available
        if (classesData.length > 0) {
          setSelectedClass(classesData[0].classId);
          const classDivs = divisionsData.filter(d => d.classId === classesData[0].classId);
          if (classDivs.length > 0) {
            setSelectedDivision(classDivs[0].divisionId);
          } else {
            setSelectedDivision('');
          }
        } else {
          setSelectedClass('');
          setSelectedDivision('');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'students_directory_configs_fetching');
      } finally {
        setLoading(false);
      }
    };

    fetchConfiguredClassesAndDivisions();
  }, [appUser, academicYear]);

  // Handle class selection changes
  const handleClassChange = (classId: string) => {
    setSelectedClass(classId);
    const validDivs = divisions.filter(d => d.classId === classId);
    if (validDivs.length > 0) {
      setSelectedDivision(validDivs[0].divisionId);
    } else {
      setSelectedDivision('');
    }
  };

  // Fetch and filter students based on chosen division & academic year history
  useEffect(() => {
    if (!selectedDivision) {
      setStudents([]);
      setTotalCount(0);
      return;
    }

    const fetchStudentsForSelectedDivision = async () => {
      setLoading(true);
      try {
        const schoolId = appUser?.schoolId;
        const studentsSnap = await getDocs(
          query(collection(db, 'students'), where('schoolId', '==', schoolId))
        );
        const allStudents = studentsSnap.docs.map(doc => doc.data() as Student);

        // Parse academic year range
        const [startYear, endYear] = academicYear.split('-').map(Number);
        const startOfAcademicYear = new Date(startYear, 5, 1); // June 1st
        const endOfAcademicYear = new Date(endYear, 4, 31); // May 31st

        const filtered = allStudents.filter(student => {
          // Check class history first
          const sortedHistory = [...(student.classHistory || [])].sort(
            (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
          );
          const history = sortedHistory.find(h => {
            const startDate = new Date(h.startDate);
            const endDate = h.endDate ? new Date(h.endDate) : new Date(2099, 11, 31);
            return startDate <= endOfAcademicYear && endDate >= startOfAcademicYear && h.divisionId === selectedDivision;
          });

          if (history) return true;

          // Fallback to primary assignment if it is the latest academic year
          const currentLatestYear = academicYears[0];
          if (academicYear === currentLatestYear && student.status === 'active' && student.divisionId === selectedDivision) {
            return true;
          }

          return false;
        });

        // Sort alphabetically
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        setStudents(filtered);
        setTotalCount(filtered.length);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'students_list_fetching');
      } finally {
        setLoading(false);
      }
    };

    fetchStudentsForSelectedDivision();
  }, [selectedDivision, academicYear, appUser]);

  // Filter students by search queries
  const filteredStudents = students.filter(student => {
    const q = searchQuery.toLowerCase();
    return (
      student.name.toLowerCase().includes(q) ||
      student.admissionNumber.toLowerCase().includes(q)
    );
  });

  // Export current student list to PDF
  const handleExportPDF = () => {
    if (filteredStudents.length === 0) return;

    const currentClass = classes.find(c => c.classId === selectedClass);
    const currentDiv = divisions.find(d => d.divisionId === selectedDivision);

    const doc = new jsPDF('p', 'mm', 'a4');
    
    doc.setFontSize(16);
    doc.text('Student Directory List', 14, 15);
    doc.setFontSize(12);
    doc.text(`School: ${school?.name || 'Attendify'}`, 14, 22);
    doc.text(`Academic Year: ${academicYear}`, 14, 28);
    doc.text(`Class & Division: ${currentClass?.name || ''} - ${currentDiv?.name || ''}`, 14, 34);

    const tableHeaders = ['SL No', 'Admission No', 'Student Name', 'Admission Date', 'Status'];
    const tableRows = filteredStudents.map((s, index) => [
      (index + 1).toString(),
      s.admissionNumber,
      s.name,
      s.admissionDate ? format(parseISO(s.admissionDate), 'dd-MM-yyyy') : '-',
      s.status.toUpperCase()
    ]);

    autoTable(doc, {
      head: [tableHeaders],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5, halign: 'left' },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
    });

    const fileName = `Students_${currentClass?.name || 'Class'}_${currentDiv?.name || 'Division'}_${academicYear}.pdf`;
    doc.save(fileName);
  };

  const selectedClassName = classes.find(c => c.classId === selectedClass)?.name || '';
  const selectedDivisionName = divisions.find(d => d.divisionId === selectedDivision)?.name || '';

  return (
    <div className="space-y-6" id="student-directory-root">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-blue-600" />
            Student Directory
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse and view students across all school classes and divisions for the selected academic year.
          </p>
        </div>

        {filteredStudents.length > 0 && (
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-blue-150 cursor-pointer self-start sm:self-auto"
          >
            <FileDown className="h-4 w-4" /> Export PDF
          </button>
        )}
      </div>

      {/* Selectors and Filters Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 pb-2 border-b border-gray-50">
          <SlidersHorizontal className="h-4 w-4 text-blue-600" />
          Filter & Lookup Settings
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Class Select */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => handleClassChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 transition-all outline-none font-medium text-gray-800"
            >
              <option value="" disabled>Select Class</option>
              {classes.map(cls => (
                <option key={cls.classId} value={cls.classId}>{cls.name}</option>
              ))}
            </select>
          </div>

          {/* Division Select */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Division</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 transition-all outline-none font-medium text-gray-800"
              disabled={!selectedClass}
            >
              <option value="" disabled>Select Division</option>
              {divisions.filter(d => d.classId === selectedClass).map(div => (
                <option key={div.divisionId} value={div.divisionId}>{div.name}</option>
              ))}
            </select>
          </div>

          {/* Search filter Input */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Search Student</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or admission no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-800 placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Counter */}
      {selectedDivision && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total in Division</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <User className="h-6 w-6" />
            </div>
          </div>
        </div>
      )}

      {/* Student List View */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-sm text-gray-500 mt-4 font-medium">Loading student list...</p>
        </div>
      ) : selectedDivision ? (
        filteredStudents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-800">No Students Found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              We couldn't find any student enrolled in this division matching your filters.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-4 px-6 text-center w-16">Sl No</th>
                    <th className="py-4 px-6">Admission No</th>
                    <th className="py-4 px-6">Name</th>
                    <th className="py-4 px-6">Admission Date</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6 text-center w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStudents.map((student, index) => (
                    <tr key={student.studentId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6 text-center text-sm font-semibold text-gray-500">
                        {index + 1}
                      </td>
                      <td className="py-4 px-6 text-sm font-bold text-gray-800 font-mono">
                        {student.admissionNumber}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-50 text-blue-600 p-2 rounded-lg font-bold text-xs uppercase h-8 w-8 flex items-center justify-center">
                            {student.name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-gray-800">{student.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-500 font-medium">
                        {student.admissionDate ? format(parseISO(student.admissionDate), 'dd MMM yyyy') : '-'}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 capitalize">
                          {student.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => setSelectedStudentForCalendar(student)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          <Calendar className="h-3.5 w-3.5" /> View Attendance
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-800">Select Class & Division</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Please choose a class and division from the filter options above to browse students.
          </p>
        </div>
      )}

      {/* Render Attendance Calendar Modal if selected */}
      {selectedStudentForCalendar && (
        <AttendanceCalendar
          student={selectedStudentForCalendar}
          className={selectedClassName}
          divisionName={selectedDivisionName}
          onClose={() => setSelectedStudentForCalendar(null)}
        />
      )}
    </div>
  );
};
