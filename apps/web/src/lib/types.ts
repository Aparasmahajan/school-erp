import type { CapabilityDef, CapabilityId, Grant, MarkStatus, Reach, RoleKey, SchoolSettings, Zone } from '@school/core/browser';

/** Shapes of API responses. Kept next to the screens that read them. */

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string;
}

export interface Me {
  user: PublicUser;
  roles: RoleKey[];
  classTeacherOf: string[];
  access: Partial<Record<CapabilityId, Reach[]>>;
  school: SchoolSettings;
  today: string;
  storage: 'sheets' | 'file' | 'memory';
}

export interface SectionInfo {
  id: string;
  name: string;
  label: string;
  room: string;
  classTeacherId: string;
  classTeacherName: string;
  studentCount: number;
  canViewStudents: boolean;
  canEditStudents: boolean;
  canViewAttendance: boolean;
  canMarkAttendance: boolean;
  canAmendAttendance: boolean;
  teachers: { id: string; userId: string; name: string; subject: string }[];
}

export interface ClassInfo {
  id: string;
  name: string;
  sortOrder: number | null;
  sections: SectionInfo[];
}

export interface StudentListItem {
  id: string;
  admissionNo: string;
  name: string;
  sectionId: string;
  sectionLabel: string;
  rollNo: number | null;
  status: 'ACTIVE' | 'LEFT';
  guardianName: string;
  guardianPhone: string;
  attendancePct: number | null;
}

export interface Guardian {
  id?: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface StudentDetail {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  name: string;
  gender: string;
  dob: string;
  sectionId: string;
  sectionLabel: string;
  rollNo: number | null;
  status: 'ACTIVE' | 'LEFT';
  joinedOn: string;
  guardians: Guardian[];
  attendance: { days: number; present: number; absent: number; late: number; leave: number; pct: number | null };
  canEdit: boolean;
}

export interface AttendanceView {
  section: { id: string; label: string };
  date: string;
  today: string;
  mode: 'mark' | 'amend' | 'view' | 'future';
  roster: { id: string; name: string; rollNo: number | null; admissionNo: string; attendancePct: number | null }[];
  record: { marks: Record<string, MarkStatus>; markedBy: string; markedAt: string; updatedBy: string; updatedAt: string } | null;
}

export interface DashboardData {
  today: string;
  students: {
    enrolled: number;
    present: number;
    absent: number;
    leave: number;
    pct: number | null;
    sectionsTotal: number;
    sectionsMarked: number;
    unmarked: { sectionId: string; label: string; classTeacherName: string }[];
  };
  trend: { date: string; pct: number | null }[];
  streaks: { studentId: string; name: string; sectionLabel: string; days: number }[];
  staff: { total: number; checkedIn: number; late: number } | null;
  me: { checkInTime: string; checkOutTime: string } | null;
}

export interface StaffMember extends PublicUser {
  roles: RoleKey[];
  classTeacherOf: string[];
}

export interface StaffRecord {
  date: string;
  checkInAt: string;
  checkInTime: string;
  checkInZone: string;
  checkInDistanceM: number | null;
  checkInAccuracyM: number | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutAt: string;
  checkOutTime: string;
  checkOutZone: string;
  checkOutDistanceM: number | null;
  checkOutAccuracyM: number | null;
  late: boolean;
}

export interface StaffMe {
  today: string;
  record: StaffRecord | null;
  zones: Zone[];
  maxAccuracyM: number;
  staffStartTime: string;
}

export interface ZoneRow {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  active: boolean;
  updatedAt: string;
}

export interface RolesData {
  roles: { key: RoleKey; label: string; staff: boolean; holders: number }[];
  capabilities: CapabilityDef[];
  grants: Grant[];
  protected: Grant[];
}
