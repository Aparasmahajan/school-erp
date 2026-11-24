/**
 * Roles a person can hold. One person can hold several (a class teacher usually also
 * teaches other sections as a subject teacher). Power comes only from roles; an admission
 * number, employee code or email never confers anything.
 */
export const ROLE_KEYS = [
  'PRINCIPAL',
  'OFFICE_ADMIN',
  'ACCOUNTANT',
  'CLASS_TEACHER',
  'SUBJECT_TEACHER',
  'PARENT',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLES: { key: RoleKey; label: string; staff: boolean }[] = [
  { key: 'PRINCIPAL', label: 'Principal', staff: true },
  { key: 'OFFICE_ADMIN', label: 'Office admin', staff: true },
  { key: 'ACCOUNTANT', label: 'Accountant', staff: true },
  { key: 'CLASS_TEACHER', label: 'Class teacher', staff: true },
  { key: 'SUBJECT_TEACHER', label: 'Subject teacher', staff: true },
  { key: 'PARENT', label: 'Parent', staff: false },
];

export const STAFF_ROLE_KEYS: RoleKey[] = ROLES.filter((r) => r.staff).map((r) => r.key);

export function roleLabel(key: string): string {
  return ROLES.find((r) => r.key === key)?.label ?? key;
}

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}
