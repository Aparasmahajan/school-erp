import type { CapabilityId } from './capabilities';
import type { Reach } from './reach';
import type { RoleKey } from './roles';

/**
 * The storage schema. One spreadsheet per school, one tab per table, row 1 = column names.
 * The same column lists drive the Google Sheets store, the local file store and, later,
 * the database migration, so they cannot drift apart.
 *
 * Rules:
 *   - `id` is always the FIRST column (stores find rows by it).
 *   - Add new columns at the END of a table; the Sheets store extends a header row that is
 *     a prefix of the expected one, and refuses anything else.
 *   - No tenantId: one install serves one school, so another school's rows can't exist here.
 */

export type ColType = 'string' | 'number' | 'boolean' | 'json';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';
export type StudentStatus = 'ACTIVE' | 'LEFT';
/** P = present, A = absent, L = late (counts as present), LV = approved leave. */
export type MarkStatus = 'P' | 'A' | 'L' | 'LV';

export interface SettingRow {
  id: string;
  value: string;
  updatedAt: string;
  updatedBy: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: string;
  createdBy: string;
  lastLoginAt: string;
}

export interface UserRoleRow {
  id: string;
  userId: string;
  role: RoleKey;
  validFrom: string;
  validTo: string;
  assignedBy: string;
  assignedAt: string;
}

export interface RoleGrantRow {
  id: string;
  role: RoleKey;
  capability: CapabilityId;
  reach: Reach;
}

export interface ClassRow {
  id: string;
  name: string;
  sortOrder: number | null;
}

export interface SectionRow {
  id: string;
  classId: string;
  name: string;
  classTeacherId: string;
  room: string;
}

export interface TeachingRow {
  id: string;
  userId: string;
  sectionId: string;
  subject: string;
}

export interface StudentRow {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  dob: string;
  sectionId: string;
  rollNo: number | null;
  status: StudentStatus;
  joinedOn: string;
  createdAt: string;
  createdBy: string;
}

export interface GuardianRow {
  id: string;
  studentId: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  /** Set when the guardian has a parent login. */
  userId: string;
}

/** One row per section per school day, not per student: keeps the tab small. */
export interface AttendanceRow {
  id: string;
  sectionId: string;
  date: string;
  marks: Record<string, MarkStatus> | null;
  present: number | null;
  absent: number | null;
  late: number | null;
  leave: number | null;
  markedBy: string;
  markedAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** An attendance zone: a circle staff must be inside to check in or out. */
export interface GeofenceRow {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  active: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface StaffAttendanceRow {
  id: string;
  userId: string;
  date: string;
  checkInAt: string;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracyM: number | null;
  checkInDistanceM: number | null;
  checkInZoneId: string;
  checkOutAt: string;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracyM: number | null;
  checkOutDistanceM: number | null;
  checkOutZoneId: string;
}

export interface AuditRow {
  id: string;
  at: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

export interface Tables {
  settings: SettingRow;
  users: UserRow;
  user_roles: UserRoleRow;
  role_grants: RoleGrantRow;
  classes: ClassRow;
  sections: SectionRow;
  teaching: TeachingRow;
  students: StudentRow;
  guardians: GuardianRow;
  attendance: AttendanceRow;
  geofences: GeofenceRow;
  staff_attendance: StaffAttendanceRow;
  audit: AuditRow;
}

export type TableName = keyof Tables;

/** Column types for one table; every field must have one, and nothing else may. */
export type TableSpec<T> = { [K in keyof T]-?: ColType };
/** A whole storage schema: table name -> its columns. Used by the school app and the Control console. */
export type SchemaSpec<M> = { [K in keyof M]: TableSpec<M[K]> };

/** Column order per table. Object key order IS the on-sheet column order. */
export const TABLES: SchemaSpec<Tables> = {
  settings: { id: 'string', value: 'string', updatedAt: 'string', updatedBy: 'string' },
  users: {
    id: 'string', email: 'string', name: 'string', phone: 'string', passwordHash: 'string',
    status: 'string', createdAt: 'string', createdBy: 'string', lastLoginAt: 'string',
  },
  user_roles: {
    id: 'string', userId: 'string', role: 'string', validFrom: 'string', validTo: 'string',
    assignedBy: 'string', assignedAt: 'string',
  },
  role_grants: { id: 'string', role: 'string', capability: 'string', reach: 'string' },
  classes: { id: 'string', name: 'string', sortOrder: 'number' },
  sections: { id: 'string', classId: 'string', name: 'string', classTeacherId: 'string', room: 'string' },
  teaching: { id: 'string', userId: 'string', sectionId: 'string', subject: 'string' },
  students: {
    id: 'string', admissionNo: 'string', firstName: 'string', lastName: 'string', gender: 'string',
    dob: 'string', sectionId: 'string', rollNo: 'number', status: 'string', joinedOn: 'string',
    createdAt: 'string', createdBy: 'string',
  },
  guardians: {
    id: 'string', studentId: 'string', name: 'string', relation: 'string', phone: 'string',
    email: 'string', isPrimary: 'boolean', userId: 'string',
  },
  attendance: {
    id: 'string', sectionId: 'string', date: 'string', marks: 'json', present: 'number',
    absent: 'number', late: 'number', leave: 'number', markedBy: 'string', markedAt: 'string',
    updatedBy: 'string', updatedAt: 'string',
  },
  geofences: {
    id: 'string', name: 'string', lat: 'number', lng: 'number', radiusM: 'number',
    active: 'boolean', updatedBy: 'string', updatedAt: 'string',
  },
  staff_attendance: {
    id: 'string', userId: 'string', date: 'string',
    checkInAt: 'string', checkInLat: 'number', checkInLng: 'number', checkInAccuracyM: 'number',
    checkInDistanceM: 'number', checkInZoneId: 'string',
    checkOutAt: 'string', checkOutLat: 'number', checkOutLng: 'number', checkOutAccuracyM: 'number',
    checkOutDistanceM: 'number', checkOutZoneId: 'string',
  },
  audit: {
    id: 'string', at: 'string', actorId: 'string', action: 'string', entity: 'string',
    entityId: 'string', before: 'json', after: 'json',
  },
};

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export function columnsOf(table: TableName): string[] {
  return Object.keys(TABLES[table]);
}
