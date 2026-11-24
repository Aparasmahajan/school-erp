import { Hono } from 'hono';
import { STAFF_ROLE_KEYS, percentPresent, timeIn, todayIn, type AttendanceRow, type Target } from '@school/core';
import { activeRolesOf, getSettings, guard, sectionLabels, type AppEnv, type Deps } from '../context';

/** Everything on the home screen, limited to what this person can reach. */
export function dashboardRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const g = guard(c);
    const [settings, sections, classes, students, records, users, userRoles, staffRecords] = await Promise.all([
      getSettings(store, config),
      store.all('sections'),
      store.all('classes'),
      store.all('students'),
      store.all('attendance'),
      store.all('users'),
      store.all('user_roles'),
      store.all('staff_attendance'),
    ]);
    const today = todayIn(settings.timezone);
    const labels = sectionLabels(sections, classes);
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const visible = sections.filter((s) => {
      const t: Target = { kind: 'section', sectionId: s.id };
      return g.can('attendance.view', t) || g.can('attendance.mark', t);
    });
    const visibleIds = new Set(visible.map((s) => s.id));
    const active = students.filter((s) => s.status === 'ACTIVE' && visibleIds.has(s.sectionId));
    const enrolled = new Map<string, number>();
    for (const s of active) enrolled.set(s.sectionId, (enrolled.get(s.sectionId) ?? 0) + 1);

    const mine = records.filter((x) => visibleIds.has(x.sectionId) && x.date <= today);
    const sum = (rows: AttendanceRow[], f: (x: AttendanceRow) => number) => rows.reduce((n, x) => n + f(x), 0);

    // ── today ──
    const todays = mine.filter((x) => x.date === today);
    const present = sum(todays, (x) => (x.present ?? 0) + (x.late ?? 0));
    const absent = sum(todays, (x) => x.absent ?? 0);
    const unmarked = visible
      .filter((s) => (enrolled.get(s.id) ?? 0) > 0 && !todays.some((x) => x.sectionId === s.id))
      .map((s) => ({ sectionId: s.id, label: labels.get(s.id) ?? '', classTeacherName: nameOf.get(s.classTeacherId) ?? '' }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    // ── last 10 school days with any record ──
    const dates = [...new Set(mine.map((x) => x.date))].sort().slice(-10);
    const trend = dates.map((date) => {
      const day = mine.filter((x) => x.date === date);
      const p = sum(day, (x) => (x.present ?? 0) + (x.late ?? 0));
      return { date, pct: percentPresent(p, p + sum(day, (x) => x.absent ?? 0)) };
    });

    // ── absent several school days running ──
    const bySection = new Map<string, AttendanceRow[]>();
    for (const x of [...mine].sort((a, b) => b.date.localeCompare(a.date))) {
      bySection.set(x.sectionId, [...(bySection.get(x.sectionId) ?? []), x]);
    }
    const streaks = active
      .filter((s) => g.can('attendance.view', { kind: 'student', studentId: s.id, sectionId: s.sectionId }))
      .map((s) => {
        let days = 0;
        for (const x of bySection.get(s.sectionId) ?? []) {
          const m = x.marks?.[s.id];
          if (m === undefined) continue;
          if (m !== 'A') break;
          days += 1;
        }
        return { studentId: s.id, name: `${s.firstName} ${s.lastName}`.trim(), sectionLabel: labels.get(s.sectionId) ?? '', days };
      })
      .filter((x) => x.days >= 3)
      .sort((a, b) => b.days - a.days)
      .slice(0, 8);

    // ── staff: only for people who can see everyone's check-ins ──
    let staff: { total: number; checkedIn: number; late: number } | null = null;
    if (g.reaches('staff_attendance.view').includes('SCHOOL')) {
      const staffIds = new Set(
        users
          .filter((u) => u.status === 'ACTIVE' && activeRolesOf(userRoles, u.id).some((role) => STAFF_ROLE_KEYS.includes(role)))
          .map((u) => u.id)
      );
      const todayStaff = staffRecords.filter((x) => x.date === today && staffIds.has(x.userId) && x.checkInAt);
      staff = {
        total: staffIds.size,
        checkedIn: todayStaff.length,
        late: todayStaff.filter((x) => timeIn(settings.timezone, new Date(x.checkInAt)) > settings.staffStartTime).length,
      };
    }

    let me: { checkInTime: string; checkOutTime: string } | null = null;
    if (g.has('staff_attendance.mark')) {
      const rec = staffRecords.find((x) => x.userId === g.actor.userId && x.date === today);
      me = {
        checkInTime: rec?.checkInAt ? timeIn(settings.timezone, new Date(rec.checkInAt)) : '',
        checkOutTime: rec?.checkOutAt ? timeIn(settings.timezone, new Date(rec.checkOutAt)) : '',
      };
    }

    return c.json({
      today,
      students: {
        enrolled: active.length,
        present,
        absent,
        leave: sum(todays, (x) => x.leave ?? 0),
        pct: percentPresent(present, present + absent),
        sectionsTotal: visible.filter((s) => (enrolled.get(s.id) ?? 0) > 0).length,
        sectionsMarked: new Set(todays.map((x) => x.sectionId)).size,
        unmarked,
      },
      trend,
      streaks,
      staff,
      me,
    });
  });

  return r;
}
