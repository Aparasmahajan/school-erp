/**
 * How far a granted capability reaches — WHOSE records it covers.
 *
 *   SCHOOL        every record in the school
 *   OWN_CLASS     sections where the person is the class teacher
 *   OWN_SECTIONS  sections they teach, plus their own class
 *   OWN_CHILD     students whose guardian record is linked to this login
 *   SELF          the person's own record
 *   NONE          not granted
 *
 * These are not a single ladder (OWN_CHILD is not "wider" than OWN_CLASS), which is why
 * permission checks test the TARGET against each grant instead of comparing ranks. The old
 * ERP compared ranks only and never looked at the target, so DOWNLINE behaved like TENANT.
 */
export const REACHES = ['SCHOOL', 'OWN_CLASS', 'OWN_SECTIONS', 'OWN_CHILD', 'SELF', 'NONE'] as const;

export type Reach = (typeof REACHES)[number];

export const REACH_LABELS: Record<Reach, string> = {
  SCHOOL: 'Whole school',
  OWN_CLASS: 'Own class',
  OWN_SECTIONS: 'Own sections',
  OWN_CHILD: 'Own child',
  SELF: 'Self',
  NONE: 'No access',
};

export function isReach(value: string): value is Reach {
  return (REACHES as readonly string[]).includes(value);
}
