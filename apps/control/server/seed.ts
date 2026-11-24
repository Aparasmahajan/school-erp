import { addDays, newId, todayIn, weekday, type Heartbeat } from '@school/core';
import { hashPassword } from '@school/server';
import { hashKey } from './keys';
import type { AdminRow, EventRow, HeartbeatRow, SchoolRecord } from './schema';
import type { ControlStore } from './store';

/**
 * Example network for development: six schools in different states, two console logins,
 * and two weeks of activity. Refused in production by the config; never loaded on top of
 * real data.
 *
 * "Sunrise Public School (demo)" uses a published key so the school app's own demo can
 * report into this console locally. The school API refuses that key in production.
 */
export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO_LOGINS = [
  { email: 'owner@control.demo', label: 'Owner (can change everything)' },
  { email: 'viewer@control.demo', label: 'Viewer (read only)' },
];
export const DEMO_SCHOOL_ID = 'sch_demo_sunrise';
export const DEMO_INSTALL_KEY = 'ik_demo_local_only_never_use_in_production';

type Spec = {
  code: string;
  name: string;
  city: string;
  board: string;
  status: SchoolRecord['status'];
  /** Minutes since the last report; null = never reported. */
  seenMinutesAgo: number | null;
  students: number;
  staff: number;
  sections: number;
  errors?: number;
  queued?: number;
  version?: string;
};

const SPECS: Spec[] = [
  { code: 'SUNRISE-JPR', name: 'Sunrise Public School (demo)', city: 'Jaipur', board: 'CBSE', status: 'LIVE', seenMinutesAgo: 2, students: 180, staff: 9, sections: 15 },
  { code: 'GREENFIELD-IDR', name: 'Greenfield Senior Secondary', city: 'Indore', board: 'MP Board', status: 'LIVE', seenMinutesAgo: 4, students: 742, staff: 41, sections: 24 },
  { code: 'STANNE-KOC', name: "St. Anne's Convent", city: 'Kochi', board: 'ICSE', status: 'LIVE', seenMinutesAgo: 47, students: 515, staff: 30, sections: 18, errors: 3 },
  { code: 'VIDYA-LKO', name: 'Vidya Niketan', city: 'Lucknow', board: 'CBSE', status: 'LIVE', seenMinutesAgo: 9 * 60, students: 388, staff: 22, sections: 14, queued: 340, version: '0.0.9' },
  { code: 'BANYAN-PNQ', name: 'Little Banyan Primary', city: 'Pune', board: 'State board', status: 'ONBOARDING', seenMinutesAgo: null, students: 0, staff: 0, sections: 0 },
  { code: 'RIVERSIDE-GAU', name: 'Riverside Academy', city: 'Guwahati', board: 'CBSE', status: 'SUSPENDED', seenMinutesAgo: 5 * 24 * 60, students: 260, staff: 16, sections: 10 },
];

function generator(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}

export async function seedControlDemo(store: ControlStore, timeZone = 'Asia/Kolkata'): Promise<void> {
  await store.ensureSchema();
  if ((await store.all('schools')).length > 0 || (await store.all('admins')).length > 0) return;

  const rand = generator(20261124);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const admins: AdminRow[] = [
    { id: 'adm_demo_owner', email: 'owner@control.demo', name: 'Console owner', passwordHash, role: 'OWNER', status: 'ACTIVE', createdAt: iso(now), createdBy: 'demo', lastLoginAt: '' },
    { id: 'adm_demo_viewer', email: 'viewer@control.demo', name: 'Support desk', passwordHash, role: 'VIEWER', status: 'ACTIVE', createdAt: iso(now), createdBy: 'demo', lastLoginAt: '' },
  ];
  await store.insert('admins', admins);

  const schools: SchoolRecord[] = [];
  const heartbeats: HeartbeatRow[] = [];
  const events: EventRow[] = [];
  const today = todayIn(timeZone);

  for (const spec of SPECS) {
    const id = spec.code === 'SUNRISE-JPR' ? DEMO_SCHOOL_ID : newId('sch');
    const key = spec.code === 'SUNRISE-JPR' ? DEMO_INSTALL_KEY : `ik_${newId('demo')}`;
    const lastSeen = spec.seenMinutesAgo == null ? 0 : now - spec.seenMinutesAgo * 60_000;
    const marked = Math.max(0, spec.sections - rand.int(0, 2));
    const presentPct = spec.students ? Math.round((91 + rand.next() * 6) * 10) / 10 : null;
    const snapshot: Partial<Heartbeat> | null = lastSeen
      ? {
          at: iso(lastSeen), appVersion: spec.version ?? '0.1.0', schemaVersion: 1, storage: 'sheets', schoolName: spec.name,
          timezone: timeZone, students: spec.students, staff: spec.staff, sections: spec.sections, sectionsMarked: marked,
          presentPct, staffCheckedIn: Math.round(spec.staff * 0.85), errors: spec.errors ?? 0, queued: spec.queued ?? 0, dropped: 0,
          uptimeS: 3 * 86_400,
        }
      : null;
    schools.push({
      id, code: spec.code, name: spec.name, city: spec.city, board: spec.board,
      contactName: 'School office', contactEmail: '', contactPhone: '', appUrl: '', plan: 'Standard',
      status: spec.status, keyHash: hashKey(key), keyPrefix: key.slice(0, 10), keyRotatedAt: iso(now - 30 * 86_400_000),
      onboardedAt: lastSeen ? iso(now - 60 * 86_400_000) : '', notes: '', createdAt: iso(now - 61 * 86_400_000), createdBy: 'adm_demo_owner',
      lastSeenAt: lastSeen ? iso(lastSeen) : '', appVersion: lastSeen ? spec.version ?? '0.1.0' : '', schemaVersion: lastSeen ? 1 : null, snapshot,
    });
    if (!lastSeen) continue;

    // hourly health history for the last 48 hours the school was reachable
    for (let h = 48; h >= 0; h--) {
      const at = lastSeen - h * 3600_000;
      heartbeats.push({
        id: `hb_${id}_${h}`, schoolId: id, at: iso(at), appVersion: spec.version ?? '0.1.0', students: spec.students,
        staff: spec.staff, sections: spec.sections, sectionsMarked: Math.min(spec.sections, Math.round(spec.sections * Math.min(1, (h % 24) / 6))),
        presentPct: Math.round((89 + rand.next() * 8) * 10) / 10, staffCheckedIn: Math.round(spec.staff * (0.6 + rand.next() * 0.35)),
        errors: spec.errors && h < 3 ? 1 : 0, queued: 0, dropped: 0, uptimeS: 3 * 86_400 - h * 3600, storage: 'sheets',
      });
    }

    // 14 days of audit trail, stopping when the school went quiet
    for (let d = 13; d >= 0; d--) {
      const date = addDays(today, -d);
      const wd = weekday(date);
      if (wd === 0) continue;
      const scale = wd === 6 ? 0.5 : 1;
      // clock time in India (UTC+5:30) on that date
      const at = (hour: number, minute: number) => Date.parse(`${date}T00:00:00Z`) + ((hour - 5.5) * 60 + minute) * 60_000;
      const push = (ms: number, action: string, entity: string, actorRoles: string[], detail: Record<string, unknown>, kind: EventRow['kind'] = 'audit') => {
        if (ms > lastSeen || ms > now) return;
        events.push({
          id: newId('aud'), schoolId: id, at: iso(ms), receivedAt: iso(ms + 4000), kind, action, entity,
          entityId: newId(entity.slice(0, 3)), actorId: newId('usr'), actorRoles, detail,
        });
      };
      const checkIns = Math.round(Math.min(spec.staff, 12) * 0.85 * scale);
      for (let i = 0; i < checkIns; i++) {
        push(at(7, 35 + rand.int(0, 50)), 'staff.check_in', 'staff_attendance', ['SUBJECT_TEACHER'], { after: { distanceM: rand.int(8, 140), accuracyM: rand.int(6, 45) } });
        push(at(14, 20 + rand.int(0, 70)), 'staff.check_out', 'staff_attendance', ['SUBJECT_TEACHER'], { after: { distanceM: rand.int(8, 140), accuracyM: rand.int(6, 45) } });
      }
      const sectionsToday = Math.round(Math.min(spec.sections, 16) * scale);
      for (let i = 0; i < sectionsToday; i++) {
        const size = rand.int(28, 42);
        const absent = rand.int(0, 4);
        push(at(8, 40 + rand.int(0, 35)), 'attendance.mark', 'attendance', ['CLASS_TEACHER', 'SUBJECT_TEACHER'], {
          after: { date, present: size - absent - 1, absent, late: 1, leave: 0, changed: size },
        });
      }
      if (rand.next() < 0.35) push(at(11, rand.int(0, 59)), 'attendance.amend', 'attendance', ['CLASS_TEACHER'], { after: { date: addDays(date, -1), changed: rand.int(1, 3) } });
      for (let i = rand.int(0, 3); i > 0; i--) push(at(10 + i, rand.int(0, 59)), 'student.update', 'student', ['OFFICE_ADMIN'], { after: { status: 'ACTIVE' } });
      if (rand.next() < 0.25) push(at(12, rand.int(0, 59)), 'student.create', 'student', ['OFFICE_ADMIN'], {});
      if (rand.next() < 0.08) push(at(13, rand.int(0, 59)), 'staff.invite', 'user', ['PRINCIPAL'], { after: { roles: ['SUBJECT_TEACHER'] } });
      if (rand.next() < 0.05) push(at(15, rand.int(0, 59)), 'roles.update', 'role_grants', ['PRINCIPAL'], { after: { changesCount: rand.int(1, 4) } });
      if (spec.errors && d === 0) {
        for (let i = 0; i < spec.errors; i++) {
          push(at(9 + i, 5), 'server.error', 'server', [], { message: 'Google Sheets returned 429 (quota) after 5 retries' }, 'error');
        }
      }
    }
  }

  await store.insert('schools', schools);
  await store.insert('heartbeats', heartbeats);
  await store.insert('events', events);
}
