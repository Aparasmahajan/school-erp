import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) => z.string().trim().min(1, `${label} is required.`).max(max);
const email = z.string().trim().toLowerCase().max(200).pipe(z.email('That email address does not look right.'));
const optionalEmail = z.union([email, z.literal('')]);
const url = z.union([z.url('Use a full address starting with https://'), z.literal('')]);

export const SCHOOL_STATUSES = ['ONBOARDING', 'LIVE', 'SUSPENDED', 'OFFBOARDED'] as const;

const schoolFields = {
  name: required(120, 'School name'),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,11}$/, 'Use 2–12 letters, digits or dashes, e.g. SUNRISE-JPR.'),
  city: text(60),
  board: text(40),
  contactName: text(120),
  contactEmail: optionalEmail,
  contactPhone: text(30),
  appUrl: url,
  plan: text(40),
  notes: text(1000),
};

export const createSchoolInput = z.strictObject({
  ...schoolFields,
  city: schoolFields.city.default(''),
  board: schoolFields.board.default(''),
  contactName: schoolFields.contactName.default(''),
  contactEmail: schoolFields.contactEmail.default(''),
  contactPhone: schoolFields.contactPhone.default(''),
  appUrl: schoolFields.appUrl.default(''),
  plan: schoolFields.plan.default('Standard'),
  notes: schoolFields.notes.default(''),
});

export const updateSchoolInput = z.strictObject({
  name: schoolFields.name.optional(),
  city: schoolFields.city.optional(),
  board: schoolFields.board.optional(),
  contactName: schoolFields.contactName.optional(),
  contactEmail: schoolFields.contactEmail.optional(),
  contactPhone: schoolFields.contactPhone.optional(),
  appUrl: schoolFields.appUrl.optional(),
  plan: schoolFields.plan.optional(),
  notes: schoolFields.notes.optional(),
  status: z.enum(SCHOOL_STATUSES).optional(),
});

export const createAdminInput = z.strictObject({
  name: required(120, 'Name'),
  email,
  role: z.enum(['OWNER', 'VIEWER']),
});

export const updateAdminInput = z.strictObject({
  name: required(120, 'Name').optional(),
  role: z.enum(['OWNER', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
