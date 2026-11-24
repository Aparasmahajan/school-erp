import type { AttendanceRow } from './tables';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Short random id, e.g. "stu_k3x9p2m0qa". Ten base-36 characters from the platform's
 * secure random source. Kept short on purpose: attendance rows store a status per student
 * id, and every character is repeated tens of thousands of times a year.
 */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return `${prefix}_${out}`;
}

/** "+91 98290 41962" -> "••••••962". Lists show this; full numbers only on the profile. */
export function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 4) return digits ? '••••' : '';
  return `••••••${digits.slice(-3)}`;
}

/** "Class 7" + "B" -> "7-B"; "Nursery" + "A" -> "Nursery-A". */
export function sectionLabel(className: string, sectionName: string): string {
  return `${className.replace(/^class\s+/i, '').trim()}-${sectionName.trim()}`;
}

export interface AttendanceStats {
  days: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  /** Late counts as present; approved leave is left out of the total. Null before any record. */
  pct: number | null;
}

export function emptyStats(): AttendanceStats {
  return { days: 0, present: 0, absent: 0, late: 0, leave: 0, pct: null };
}

/** Per-student attendance totals from section-day rows, on or after `since`. */
export function attendanceStats(rows: AttendanceRow[], since: string): Map<string, AttendanceStats> {
  const stats = new Map<string, AttendanceStats>();
  for (const row of rows) {
    if (row.date < since || !row.marks) continue;
    for (const [studentId, status] of Object.entries(row.marks)) {
      const s = stats.get(studentId) ?? emptyStats();
      s.days += 1;
      if (status === 'P') s.present += 1;
      else if (status === 'A') s.absent += 1;
      else if (status === 'L') s.late += 1;
      else if (status === 'LV') s.leave += 1;
      stats.set(studentId, s);
    }
  }
  for (const s of stats.values()) s.pct = percentPresent(s.present + s.late, s.days - s.leave);
  return stats;
}

export function percentPresent(present: number, counted: number): number | null {
  return counted > 0 ? Math.round((present / counted) * 1000) / 10 : null;
}

export function countMarks(marks: Record<string, string>) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const status of Object.values(marks)) {
    if (status === 'P') counts.present += 1;
    else if (status === 'A') counts.absent += 1;
    else if (status === 'L') counts.late += 1;
    else if (status === 'LV') counts.leave += 1;
  }
  return counts;
}
