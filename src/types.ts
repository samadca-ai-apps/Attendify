export type UserRole = 'admin' | 'it_coordinator' | 'teacher';

export interface School {
  schoolId: string;
  name: string;
  address: string;
  contactPerson: string;
  schoolCode: string;
  email?: string;
  createdAt: string;
}

export interface User {
  uid: string;
  schoolId: string;
  role: UserRole;
  name: string;
  teacherId: string;
  status: 'active' | 'inactive';
  firstLogin: boolean;
}

export interface Class {
  classId: string;
  schoolId: string;
  name: string;
  startDate?: string;
}

export interface Division {
  divisionId: string;
  schoolId: string;
  classId: string;
  name: string;
  teacherId?: string;
}

export interface ClassHistory {
  classId: string;
  divisionId: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface Student {
  studentId: string;
  schoolId: string;
  classId: string;
  divisionId: string;
  name: string;
  admissionNumber: string;
  status: 'active' | 'pass-out' | 'terminated';
  admissionDate: string; // YYYY-MM-DD
  promotionDate?: string; // YYYY-MM-DD
  passoutDate?: string; // YYYY-MM-DD
  terminationDate?: string; // YYYY-MM-DD
  terminationReason?: string;
  classHistory: ClassHistory[];
}

export interface AttendanceRecord {
  studentId: string;
  status: 'full_day' | 'fn_only' | 'an_only' | 'absent';
  note?: string;
}

export interface Attendance {
  attendanceId: string;
  schoolId: string;
  classId: string;
  divisionId: string;
  className?: string;
  divisionName?: string;
  date: string;
  records: AttendanceRecord[];
  submittedBy: string;
  timestamp: string;
}

export interface Holiday {
  holidayId: string;
  schoolId: string;
  date: string; // YYYY-MM-DD
  type: 'holiday' | 'working_saturday';
  reason?: string;
}

export interface AcademicYearConfig {
  configId: string;
  schoolId: string;
  academicYear: string;
  classId: string;
  divisionId?: string;
  startDate?: string;
  teacherId?: string;
}
