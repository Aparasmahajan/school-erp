import { CAPABILITY_IDS, type CapabilityId } from './capabilities';
import type { Grant } from './permissions';
import type { Reach } from './reach';
import type { RoleKey } from './roles';

/**
 * The starting permission matrix for a new school. The principal can change it on the
 * Roles & access screen; this is only what a fresh install gets.
 */
const DEFAULTS: Record<RoleKey, Partial<Record<CapabilityId, Reach>>> = {
  PRINCIPAL: {
    ...Object.fromEntries(CAPABILITY_IDS.map((c) => [c, 'SCHOOL'])),
    'staff_attendance.mark': 'SELF',
  },
  OFFICE_ADMIN: {
    'students.view': 'SCHOOL',
    'students.edit': 'SCHOOL',
    'attendance.view': 'SCHOOL',
    'attendance.mark': 'SCHOOL',
    'staff_attendance.mark': 'SELF',
    'staff_attendance.view': 'SCHOOL',
    'geofences.manage': 'SCHOOL',
    'staff.view': 'SCHOOL',
    'staff.manage': 'SCHOOL',
    'classes.manage': 'SCHOOL',
    'settings.manage': 'SCHOOL',
  },
  ACCOUNTANT: {
    'students.view': 'SCHOOL',
    'staff_attendance.mark': 'SELF',
    'staff_attendance.view': 'SELF',
    'staff.view': 'SELF',
  },
  CLASS_TEACHER: {
    'students.view': 'OWN_CLASS',
    'students.edit': 'OWN_CLASS',
    'attendance.view': 'OWN_CLASS',
    'attendance.mark': 'OWN_CLASS',
    'attendance.amend': 'OWN_CLASS',
    'staff_attendance.mark': 'SELF',
    'staff_attendance.view': 'SELF',
    'staff.view': 'SELF',
  },
  SUBJECT_TEACHER: {
    'students.view': 'OWN_SECTIONS',
    'attendance.view': 'OWN_SECTIONS',
    'staff_attendance.mark': 'SELF',
    'staff_attendance.view': 'SELF',
    'staff.view': 'SELF',
  },
  PARENT: {
    'students.view': 'OWN_CHILD',
    'attendance.view': 'OWN_CHILD',
  },
};

export function defaultGrants(): Grant[] {
  const out: Grant[] = [];
  for (const [role, caps] of Object.entries(DEFAULTS) as [RoleKey, Partial<Record<CapabilityId, Reach>>][]) {
    for (const [capability, reach] of Object.entries(caps) as [CapabilityId, Reach][]) {
      out.push({ role, capability, reach });
    }
  }
  return out;
}

/**
 * Grants that can never be removed, so a school cannot lock itself out of its own roles
 * screen.
 */
export const PROTECTED_GRANTS: Grant[] = [{ role: 'PRINCIPAL', capability: 'roles.manage', reach: 'SCHOOL' }];
