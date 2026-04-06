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
}

export interface Division {
  divisionId: string;
  schoolId: string;
  classId: string;
  name: string;
  teacherId?: string;
}

export interface Student {
  studentId: string;
  schoolId: string;
  classId: string;
  divisionId: string;
  name: string;
  admissionNumber: string;
  status: 'active' | 'pass-out';
}

export interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent' | 'late' | 'leave';
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
