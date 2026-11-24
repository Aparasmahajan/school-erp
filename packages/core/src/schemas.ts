import { z } from 'zod';
import { CAPABILITY_IDS } from './capabilities';
import { REACHES } from './reach';
import { ROLE_KEYS } from './roles';
import { isIsoDate } from './dates';

/**
 * Request bodies. Every schema is STRICT: an unknown field (say `actorId` or `markedBy`)
 * is rejected, not ignored. Who is acting always comes from the session, never the body.
 */

export const isoDate = z.string().refine(isIsoDate, 'Use a date like 2026-11-24.');
const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) => z.string().trim().min(1, `${label} is required.`).max(max);
const email = z.string().trim().toLowerCase().max(200).pipe(z.email('That email address does not look right.'));
const phone = z.string().trim().max(30).regex(/^[+\d\s()-]*$/, 'Phone numbers can only contain digits, spaces, +, - and brackets.');

// ── auth ──
export const loginInput = z.strictObject({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

export const acceptInviteInput = z.strictObject({
  token: z.string().min(10).max(4000),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});

// ── attendance ──
export const markStatus = z.enum(['P', 'A', 'L', 'LV']);

export const saveAttendanceInput = z.strictObject({
  sectionId: z.string().min(1).max(40),
  date: isoDate,
  marks: z.record(z.string().min(1).max(40), markStatus),
});

// ── students ──
const guardianInput = z.strictObject({
  id: z.string().max(40).optional(),
  name: required(120, 'Guardian name'),
  relation: required(40, 'Relation'),
  phone: phone.default(''),
  email: z.union([email, z.literal('')]).default(''),
  isPrimary: z.boolean().default(false),
});

const studentFields = {
  admissionNo: required(40, 'Admission number'),
  firstName: required(80, 'First name'),
  lastName: trimmed(80),
  gender: z.enum(['M', 'F', 'O', '']),
  dob: z.union([isoDate, z.literal('')]),
  sectionId: z.string().min(1, 'Choose a section.').max(40),
  rollNo: z.number().int().min(1).max(999).nullable(),
};

export const createStudentInput = z.strictObject({
  ...studentFields,
  lastName: studentFields.lastName.default(''),
  gender: studentFields.gender.default(''),
  dob: studentFields.dob.default(''),
  rollNo: studentFields.rollNo.default(null),
  guardians: z.array(guardianInput).max(4).default([]),
});

/** No defaults here: a field left out of a PATCH must stay as it is. */
export const updateStudentInput = z.strictObject({
  admissionNo: studentFields.admissionNo.optional(),
  firstName: studentFields.firstName.optional(),
  lastName: studentFields.lastName.optional(),
  gender: studentFields.gender.optional(),
  dob: studentFields.dob.optional(),
  sectionId: studentFields.sectionId.optional(),
  rollNo: studentFields.rollNo.optional(),
  status: z.enum(['ACTIVE', 'LEFT']).optional(),
  guardians: z.array(guardianInput).max(4).optional(),
});

// ── staff ──
export const createStaffInput = z.strictObject({
  name: required(120, 'Name'),
  email,
  phone: phone.default(''),
  roles: z.array(z.enum(ROLE_KEYS)).min(1, 'Choose at least one role.'),
});

export const updateStaffInput = z.strictObject({
  name: required(120, 'Name').optional(),
  phone: phone.optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  roles: z.array(z.enum(ROLE_KEYS)).min(1, 'Choose at least one role.').optional(),
});

// ── classes ──
export const createClassInput = z.strictObject({
  name: required(40, 'Class name'),
  sortOrder: z.number().int().min(0).max(999).nullable().default(null),
});

export const createSectionInput = z.strictObject({
  classId: z.string().min(1).max(40),
  name: required(20, 'Section name'),
  classTeacherId: z.string().max(40).default(''),
  room: trimmed(40).default(''),
});

export const updateSectionInput = z.strictObject({
  name: required(20, 'Section name').optional(),
  classTeacherId: z.string().max(40).optional(),
  room: trimmed(40).optional(),
});

export const teachingInput = z.strictObject({
  userId: z.string().min(1).max(40),
  sectionId: z.string().min(1).max(40),
  subject: required(60, 'Subject'),
});

// ── roles ──
export const grantsInput = z.strictObject({
  grants: z
    .array(
      z.strictObject({
        role: z.enum(ROLE_KEYS),
        capability: z.enum(CAPABILITY_IDS),
        reach: z.enum(REACHES),
      })
    )
    .max(1000),
});

// ── geofenced staff attendance ──
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const zoneInput = z.strictObject({
  name: required(80, 'Zone name'),
  lat,
  lng,
  radiusM: z.number().int().min(20, 'Use a radius of at least 20 m.').max(5000, 'Use a radius of at most 5,000 m.'),
  active: z.boolean().default(true),
});

export const updateZoneInput = z.strictObject({
  name: required(80, 'Zone name').optional(),
  lat: lat.optional(),
  lng: lng.optional(),
  radiusM: z.number().int().min(20).max(5000).optional(),
  active: z.boolean().optional(),
});

export const checkInput = z.strictObject({
  action: z.enum(['in', 'out']),
  lat,
  lng,
  accuracyM: z.number().min(0).max(100_000),
});

// ── settings ──
export const settingsInput = z.strictObject({
  schoolName: required(120, 'School name').optional(),
  timezone: z.string().min(1).max(60).optional(),
  academicYearStart: isoDate.optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #13795B.').optional(),
  staffStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:00.').optional(),
  geoMaxAccuracyM: z.number().int().min(10).max(1000).optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentInput>;
export type UpdateStudentInput = z.infer<typeof updateStudentInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
