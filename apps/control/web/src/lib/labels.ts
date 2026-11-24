import { roleLabel } from '@school/core/browser';
import type { TrailEvent } from './types';

/** Plain-language names for what schools and console users did. */
const ACTIONS: Record<string, string> = {
  'attendance.mark': 'Marked attendance',
  'attendance.update': "Corrected today's attendance",
  'attendance.amend': 'Changed past attendance',
  'student.create': 'Added a student',
  'student.update': 'Edited a student',
  'staff.invite': 'Invited a staff member',
  'staff.update': 'Changed a staff account',
  'staff.check_in': 'Checked in',
  'staff.check_out': 'Checked out',
  'user.accept_invite': 'Accepted an invite',
  'zone.create': 'Added an attendance zone',
  'zone.update': 'Changed an attendance zone',
  'zone.delete': 'Removed an attendance zone',
  'roles.update': 'Changed roles & access',
  'settings.update': 'Changed school settings',
  'class.create': 'Added a class',
  'section.create': 'Added a section',
  'section.update': 'Changed a section',
  'teaching.create': 'Assigned a subject teacher',
  'teaching.delete': 'Removed a subject teacher',
  'server.error': 'Server error',
  // console
  'console.sign_in': 'Signed in',
  'school.onboard': 'Onboarded a school',
  'school.update': 'Edited a school',
  'school.rotate_key': 'Issued a new install key',
  'school.went_live': 'School went live',
  'school.live': 'Marked school live',
  'school.onboarding': 'Moved school back to onboarding',
  'school.suspended': 'Suspended a school',
  'school.offboarded': 'Offboarded a school',
  'admin.invite': 'Invited a console user',
  'admin.update': 'Changed a console user',
  'admin.accept_invite': 'Accepted a console invite',
};

export function actionLabel(action: string): string {
  return ACTIONS[action] ?? action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function rolesLabel(roles: string[] | null): string {
  return roles && roles.length ? roles.map(roleLabel).join(', ') : '—';
}

/** A short, readable summary of an event's allow-listed details. */
export function detailSummary(e: TrailEvent): string[] {
  const d = e.detail ?? {};
  if (e.kind === 'error') return d.message ? [String(d.message)] : [];
  const a = (d.after ?? {}) as Record<string, unknown>;
  const b = (d.before ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  if (typeof a.present === 'number') {
    const parts = [`${a.present} present`, `${a.absent ?? 0} absent`];
    if (a.late) parts.push(`${a.late} late`);
    if (a.leave) parts.push(`${a.leave} on leave`);
    out.push(parts.join(' · '));
  }
  if (typeof a.date === 'string') out.push(`for ${new Date(`${a.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`);
  if (typeof a.changed === 'number' && typeof a.present !== 'number') out.push(`${a.changed} changed`);
  if (typeof a.distanceM === 'number') out.push(`${a.distanceM} m from zone centre${typeof a.accuracyM === 'number' ? ` (±${a.accuracyM} m)` : ''}`);
  if (typeof a.status === 'string' && b.status && b.status !== a.status) out.push(`${b.status} → ${a.status}`);
  if (Array.isArray(a.roles)) out.push((a.roles as string[]).map(roleLabel).join(', '));
  if (typeof a.changesCount === 'number') out.push(`${a.changesCount} permission ${a.changesCount === 1 ? 'change' : 'changes'}`);
  if (typeof a.radiusM === 'number') out.push(`radius ${a.radiusM} m`);
  return out;
}
