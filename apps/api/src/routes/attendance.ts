import { Hono } from 'hono';
import {
  attendanceStats,
  countMarks,
  isIsoDate,
  newId,
  percentPresent,
  saveAttendanceInput,
  todayIn,
  type AttendanceRow,
  type Target,
} from '@school/core';
import { audit, getSettings, guard, sectionLabels, type AppEnv, type Deps } from '../context';
import { HttpError, badRequest, notFound } from '../lib/errors';
import { readBody } from '../lib/http';

/**
 * Student attendance: one record per section per day, saved in ONE request.
 *
 * Who marked it always comes from the session. The old ERP took `actorId` from the request
 * body, so any signed-in person could act as the principal; the strict schema here rejects
 * that field outright.
 *
 *   today       needs attendance.mark  on the section
 *   past day    needs attendance.amend on the section (and is labelled as an amendment)
 *   future      refused
 */
export function attendanceRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const g = guard(c);
    const sectionId = c.req.query('sectionId') ?? '';
    const [settings, sections, classes, students, records, users] = await Promise.all([
      getSettings(store, config),
      store.all('sections'),
      store.all('classes'),
      store.all('students'),
      store.all('attendance'),
      store.all('users'),
    ]);
    const today = todayIn(settings.timezone);
    const date = c.req.query('date') || today;
    if (!isIsoDate(date)) throw badRequest('Use a date like 2026-11-24.');

    const section = sections.find((s) => s.id === sectionId);
    if (!section) throw notFound('No such section.');
    const t: Target = { kind: 'section', sectionId: section.id };
    const canMark = g.can('attendance.mark', t);
    const canAmend = g.can('attendance.amend', t);
    if (!g.can('attendance.view', t) && !canMark && !canAmend) throw notFound('No such section.');

    const record = records.find((x) => x.sectionId === section.id && x.date === date) ?? null;
    const stats = attendanceStats(records, settings.academicYearStart);
    const inRecord = new Set(Object.keys(record?.marks ?? {}));
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const roster = students
      .filter((s) => s.sectionId === section.id && (s.status === 'ACTIVE' || inRecord.has(s.id)))
      .sort((a, b) => (a.rollNo ?? 999) - (b.rollNo ?? 999) || a.firstName.localeCompare(b.firstName))
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNo: s.rollNo,
        admissionNo: s.admissionNo,
        attendancePct: stats.get(s.id)?.pct ?? null,
      }));

    const mode =
      date > today ? 'future' : date === today ? (canMark ? 'mark' : 'view') : canAmend ? 'amend' : 'view';

    return c.json({
      section: { id: section.id, label: sectionLabels(sections, classes).get(section.id) ?? '' },
      date,
      today,
      mode,
      roster,
      record: record && {
        marks: record.marks ?? {},
        markedBy: nameOf.get(record.markedBy) ?? '',
        markedAt: record.markedAt,
        updatedBy: nameOf.get(record.updatedBy) ?? '',
        updatedAt: record.updatedAt,
      },
    });
  });

  r.put('/', async (c) => {
    const g = guard(c);
    const body = await readBody(c, saveAttendanceInput);
    const settings = await getSettings(store, config);
    const today = todayIn(settings.timezone);
    if (body.date > today) throw badRequest("You can't mark attendance for a future date.");
    if (body.date < settings.academicYearStart) throw badRequest('That date is before this academic year started.');

    const section = (await store.all('sections')).find((s) => s.id === body.sectionId);
    if (!section) throw notFound('No such section.');
    const t: Target = { kind: 'section', sectionId: section.id };
    const isToday = body.date === today;
    if (isToday) g.require('attendance.mark', t, "You can't mark attendance for this section.");
    else g.require('attendance.amend', t, "You can't change past attendance for this section.");

    const now = new Date().toISOString();
    const { row, before } = await store.exclusive(async () => {
      const [students, records] = await Promise.all([store.all('students'), store.all('attendance')]);
      const existing = records.find((x) => x.sectionId === section.id && x.date === body.date) ?? null;
      const active = students.filter((s) => s.sectionId === section.id && s.status === 'ACTIVE');
      const allowed = new Set([...active.map((s) => s.id), ...Object.keys(existing?.marks ?? {})]);

      const unknown = Object.keys(body.marks).filter((id) => !allowed.has(id));
      if (unknown.length) throw badRequest(`${unknown.length} of those students aren't in ${section.name}. Reload and try again.`);

      // Every student needs a status, so "not marked" can never be mistaken for "present".
      const required = existing && !isToday ? Object.keys(existing.marks ?? {}) : active.map((s) => s.id);
      const missing = required.filter((id) => !(id in body.marks));
      if (missing.length) {
        throw new HttpError(400, `Give every student a status (${missing.length} missing).`, { missing });
      }

      const counts = countMarks(body.marks);
      if (existing) {
        const updated = await store.update('attendance', existing.id, {
          marks: body.marks,
          ...counts,
          updatedBy: g.actor.userId,
          updatedAt: now,
        });
        return { row: updated!, before: existing };
      }
      const created: AttendanceRow = {
        id: newId('att'),
        sectionId: section.id,
        date: body.date,
        marks: body.marks,
        ...counts,
        markedBy: g.actor.userId,
        markedAt: now,
        updatedBy: '',
        updatedAt: '',
      };
      await store.insert('attendance', [created]);
      return { row: created, before: null };
    });

    const changed = Object.keys(body.marks).filter((id) => before?.marks?.[id] !== body.marks[id]);
    await audit(store, {
      actorId: g.actor.userId,
      action: !before ? 'attendance.mark' : isToday ? 'attendance.update' : 'attendance.amend',
      entity: 'attendance',
      entityId: row.id,
      before: before && { present: before.present, absent: before.absent, late: before.late, leave: before.leave },
      after: { sectionId: section.id, date: body.date, present: row.present, absent: row.absent, late: row.late, leave: row.leave, changed: changed.length },
    });

    return c.json({
      id: row.id,
      created: !before,
      savedAt: now,
      counts: { present: row.present ?? 0, absent: row.absent ?? 0, late: row.late ?? 0, leave: row.leave ?? 0 },
    });
  });

  /** One line per section the person can see: marked yet, and the counts. */
  r.get('/summary', async (c) => {
    const g = guard(c);
    const [settings, sections, classes, students, records, users] = await Promise.all([
      getSettings(store, config),
      store.all('sections'),
      store.all('classes'),
      store.all('students'),
      store.all('attendance'),
      store.all('users'),
    ]);
    const date = c.req.query('date') || todayIn(settings.timezone);
    if (!isIsoDate(date)) throw badRequest('Use a date like 2026-11-24.');
    const labels = sectionLabels(sections, classes);
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const items = sections
      .filter((s) => {
        const t: Target = { kind: 'section', sectionId: s.id };
        return g.can('attendance.view', t) || g.can('attendance.mark', t);
      })
      .map((s) => {
        const rec = records.find((x) => x.sectionId === s.id && x.date === date);
        return {
          sectionId: s.id,
          label: labels.get(s.id) ?? '',
          classTeacherName: nameOf.get(s.classTeacherId) ?? '',
          students: students.filter((st) => st.sectionId === s.id && st.status === 'ACTIVE').length,
          marked: !!rec,
          present: rec?.present ?? 0,
          absent: rec?.absent ?? 0,
          late: rec?.late ?? 0,
          leave: rec?.leave ?? 0,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    const marked = items.filter((i) => i.marked);
    const present = marked.reduce((n, i) => n + i.present + i.late, 0);
    const counted = marked.reduce((n, i) => n + i.present + i.late + i.absent, 0);
    return c.json({
      date,
      sections: items,
      totals: {
        sections: items.length,
        marked: marked.length,
        present,
        absent: marked.reduce((n, i) => n + i.absent, 0),
        leave: marked.reduce((n, i) => n + i.leave, 0),
        pct: percentPresent(present, counted),
      },
    });
  });

  return r;
}
