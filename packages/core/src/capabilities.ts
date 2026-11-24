import type { Reach } from './reach';

/**
 * Every action the system checks. A capability is granted to a ROLE at a REACH (whose
 * records it covers). `allowed` lists the reaches that make sense for it, so the roles
 * screen cannot offer nonsense such as "check in on behalf of the whole school".
 *
 * Adding a module: add its capabilities here, give them defaults in defaults.ts, and
 * check them in the API with guard(c).require(...).
 */
export const CAPABILITY_IDS = [
  'students.view',
  'students.edit',
  'attendance.view',
  'attendance.mark',
  'attendance.amend',
  'staff_attendance.mark',
  'staff_attendance.view',
  'geofences.manage',
  'staff.view',
  'staff.manage',
  'classes.manage',
  'roles.manage',
  'settings.manage',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export interface CapabilityDef {
  id: CapabilityId;
  label: string;
  module: string;
  allowed: Reach[];
  /** Grants authority over other people or changes history. Highlighted in the UI. */
  sensitive?: boolean;
}

const STUDENT_REACHES: Reach[] = ['SCHOOL', 'OWN_CLASS', 'OWN_SECTIONS', 'OWN_CHILD', 'SELF', 'NONE'];
const SCHOOL_ONLY: Reach[] = ['SCHOOL', 'NONE'];

export const CAPABILITIES: CapabilityDef[] = [
  { id: 'students.view', label: 'View student profiles', module: 'Students', allowed: STUDENT_REACHES },
  { id: 'students.edit', label: 'Add and edit students', module: 'Students', allowed: ['SCHOOL', 'OWN_CLASS', 'NONE'] },
  { id: 'attendance.view', label: 'See student attendance', module: 'Attendance', allowed: STUDENT_REACHES },
  { id: 'attendance.mark', label: "Mark today's attendance", module: 'Attendance', allowed: ['SCHOOL', 'OWN_CLASS', 'OWN_SECTIONS', 'NONE'] },
  { id: 'attendance.amend', label: 'Change past attendance', module: 'Attendance', allowed: ['SCHOOL', 'OWN_CLASS', 'NONE'], sensitive: true },
  { id: 'staff_attendance.mark', label: 'Check in and out (location checked)', module: 'Staff attendance', allowed: ['SELF', 'NONE'] },
  { id: 'staff_attendance.view', label: 'See staff check-ins', module: 'Staff attendance', allowed: ['SCHOOL', 'SELF', 'NONE'] },
  { id: 'geofences.manage', label: 'Set attendance zones', module: 'Staff attendance', allowed: SCHOOL_ONLY, sensitive: true },
  { id: 'staff.view', label: 'See the staff list', module: 'Staff', allowed: ['SCHOOL', 'SELF', 'NONE'] },
  { id: 'staff.manage', label: 'Invite staff and change their roles', module: 'Staff', allowed: SCHOOL_ONLY, sensitive: true },
  { id: 'classes.manage', label: 'Manage classes and class teachers', module: 'Administration', allowed: SCHOOL_ONLY },
  { id: 'roles.manage', label: 'Change roles and access', module: 'Administration', allowed: SCHOOL_ONLY, sensitive: true },
  { id: 'settings.manage', label: 'Change school settings', module: 'Administration', allowed: SCHOOL_ONLY },
];

export function capabilityDef(id: string): CapabilityDef | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

export function isCapabilityId(value: string): value is CapabilityId {
  return (CAPABILITY_IDS as readonly string[]).includes(value);
}
