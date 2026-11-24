import { Hono } from 'hono';
import {
  attendanceStats,
  createStudentInput,
  emptyStats,
  maskPhone,
  newId,
  updateStudentInput,
  type GuardianRow,
  type StudentRow,
  type Target,
} from '@school/core';
import { audit, getSettings, guard, sectionLabels, type AppEnv, type Deps } from '../context';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors';
import { readBody } from '../lib/http';
import type { Store } from '../store';

const studentTarget = (s: Pick<StudentRow, 'id' | 'sectionId'>): Target => ({
  kind: 'student',
  studentId: s.id,
  sectionId: s.sectionId,
});

const fullName = (s: Pick<StudentRow, 'firstName' | 'lastName'>) => `${s.firstName} ${s.lastName}`.trim();

type GuardianIn = { id?: string; name: string; relation: string; phone: string; email: string; isPrimary: boolean };

/** Exactly one primary guardian when there are any: the first one flagged, else the first. */
function withOnePrimary<T extends { isPrimary: boolean }>(list: T[]): T[] {
  const first = Math.max(0, list.findIndex((g) => g.isPrimary));
  return list.map((g, i) => ({ ...g, isPrimary: i === first }));
}

async function assertUnique(store: Store, body: { admissionNo?: string; rollNo?: number | null; sectionId?: string }, current?: StudentRow) {
  const students = await store.all('students');
  const admissionNo = body.admissionNo ?? current?.admissionNo;
  if (
    admissionNo &&
    students.some((s) => s.id !== current?.id && s.admissionNo.toLowerCase() === admissionNo.toLowerCase())
  ) {
    throw conflict(`Admission number ${admissionNo} is already used by another student.`);
  }
  const sectionId = body.sectionId ?? current?.sectionId;
  const rollNo = body.rollNo !== undefined ? body.rollNo : current?.rollNo;
  if (
    rollNo != null &&
    students.some((s) => s.id !== current?.id && s.status === 'ACTIVE' && s.sectionId === sectionId && s.rollNo === rollNo)
  ) {
    throw conflict(`Roll number ${rollNo} is already taken in that section.`);
  }
}

export function studentsRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  /** Only the students this person can reach. Phone numbers are masked in lists. */
  r.get('/', async (c) => {
    const g = guard(c);
    if (!g.has('students.view')) throw new HttpError(403, "You don't have access to student records.");
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const sectionId = c.req.query('sectionId') ?? '';
    const status = c.req.query('status') ?? 'ACTIVE';

    const [students, sections, classes, guardians, attendance, settings] = await Promise.all([
      store.all('students'),
      store.all('sections'),
      store.all('classes'),
      store.all('guardians'),
      store.all('attendance'),
      getSettings(store, config),
    ]);
    const labels = sectionLabels(sections, classes);
    const stats = attendanceStats(attendance, settings.academicYearStart);
    const primary = new Map<string, GuardianRow>();
    for (const gd of guardians) if (gd.isPrimary || !primary.has(gd.studentId)) primary.set(gd.studentId, gd);

    const rows = students
      .filter((s) => status === 'ALL' || s.status === status)
      .filter((s) => !sectionId || s.sectionId === sectionId)
      .filter((s) => g.can('students.view', studentTarget(s)))
      .filter((s) => {
        if (!q) return true;
        const gd = primary.get(s.id);
        return (
          fullName(s).toLowerCase().includes(q) ||
          s.admissionNo.toLowerCase().includes(q) ||
          (gd?.name.toLowerCase().includes(q) ?? false) ||
          (qDigits.length >= 4 && (gd?.phone.replace(/\D/g, '').includes(qDigits) ?? false))
        );
      })
      .map((s) => {
        const gd = primary.get(s.id);
        return {
          id: s.id,
          admissionNo: s.admissionNo,
          name: fullName(s),
          sectionId: s.sectionId,
          sectionLabel: labels.get(s.sectionId) ?? '',
          rollNo: s.rollNo,
          status: s.status,
          guardianName: gd?.name ?? '',
          guardianPhone: maskPhone(gd?.phone ?? ''),
          attendancePct: stats.get(s.id)?.pct ?? null,
        };
      })
      .sort(
        (a, b) =>
          a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true }) ||
          (a.rollNo ?? 999) - (b.rollNo ?? 999) ||
          a.name.localeCompare(b.name)
      );

    return c.json({ students: rows, total: rows.length });
  });

  /** 404 rather than 403 when out of reach, so the response doesn't confirm the record exists. */
  r.get('/:id', async (c) => {
    const g = guard(c);
    const [students, sections, classes, guardians, attendance, settings] = await Promise.all([
      store.all('students'),
      store.all('sections'),
      store.all('classes'),
      store.all('guardians'),
      store.all('attendance'),
      getSettings(store, config),
    ]);
    const s = students.find((x) => x.id === c.req.param('id'));
    if (!s || !g.can('students.view', studentTarget(s))) throw notFound('No such student.');
    const stats = attendanceStats(attendance, settings.academicYearStart).get(s.id) ?? emptyStats();
    return c.json({
      student: {
        ...s,
        name: fullName(s),
        sectionLabel: sectionLabels(sections, classes).get(s.sectionId) ?? '',
        guardians: guardians
          .filter((gd) => gd.studentId === s.id)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          .map(({ id, name, relation, phone, email, isPrimary }) => ({ id, name, relation, phone, email, isPrimary })),
        attendance: stats,
        canEdit: g.can('students.edit', studentTarget(s)),
      },
    });
  });

  r.post('/', async (c) => {
    const g = guard(c);
    const body = await readBody(c, createStudentInput);
    g.require('students.edit', { kind: 'student', studentId: '', sectionId: body.sectionId }, "You can't add students to that section.");

    const student = await store.exclusive(async () => {
      const sections = await store.all('sections');
      if (!sections.some((s) => s.id === body.sectionId)) throw notFound('That section does not exist.');
      await assertUnique(store, body);
      const now = new Date().toISOString();
      const row: StudentRow = {
        id: newId('stu'),
        admissionNo: body.admissionNo,
        firstName: body.firstName,
        lastName: body.lastName,
        gender: body.gender,
        dob: body.dob,
        sectionId: body.sectionId,
        rollNo: body.rollNo,
        status: 'ACTIVE',
        joinedOn: now.slice(0, 10),
        createdAt: now,
        createdBy: g.actor.userId,
      };
      await store.insert('students', [row]);
      await store.insert(
        'guardians',
        withOnePrimary(body.guardians).map((gd) => ({
          id: newId('grd'),
          studentId: row.id,
          name: gd.name,
          relation: gd.relation,
          phone: gd.phone,
          email: gd.email,
          isPrimary: gd.isPrimary,
          userId: '',
        }))
      );
      return row;
    });

    await audit(store, { actorId: g.actor.userId, action: 'student.create', entity: 'student', entityId: student.id, before: null, after: { ...student, guardians: body.guardians.length } });
    return c.json({ id: student.id }, 201);
  });

  r.patch('/:id', async (c) => {
    const g = guard(c);
    const body = await readBody(c, updateStudentInput);

    const { before, after } = await store.exclusive(async () => {
      const [students, sections] = await Promise.all([store.all('students'), store.all('sections')]);
      const current = students.find((x) => x.id === c.req.param('id'));
      if (!current || !g.can('students.view', studentTarget(current))) throw notFound('No such student.');
      g.require('students.edit', studentTarget(current), "You can't edit this student.");
      if (body.sectionId && body.sectionId !== current.sectionId) {
        if (!sections.some((s) => s.id === body.sectionId)) throw notFound('That section does not exist.');
        // Moving a student needs edit rights on BOTH sections.
        g.require('students.edit', { kind: 'student', studentId: current.id, sectionId: body.sectionId }, "You can't move students into that section.");
      }
      await assertUnique(store, body, current);

      const { guardians: guardianInput, ...fields } = body;
      const updated = Object.keys(fields).length ? await store.update('students', current.id, fields) : current;
      if (guardianInput) await replaceGuardians(store, current.id, guardianInput);
      return { before: current, after: updated! };
    });

    await audit(store, { actorId: g.actor.userId, action: 'student.update', entity: 'student', entityId: after.id, before, after });
    return c.json({ ok: true });
  });

  return r;
}

/** Update guardians that kept their id, add new ones, remove the rest. */
async function replaceGuardians(store: Store, studentId: string, input: GuardianIn[]): Promise<void> {
  if (input.length === 0) throw badRequest('Keep at least one guardian on file.');
  const existing = (await store.all('guardians')).filter((gd) => gd.studentId === studentId);
  const wanted = withOnePrimary(input);
  const keep = new Set(wanted.map((gd) => gd.id).filter((id): id is string => !!id && existing.some((e) => e.id === id)));
  for (const old of existing) if (!keep.has(old.id)) await store.remove('guardians', old.id);
  for (const gd of wanted) {
    const fields = { name: gd.name, relation: gd.relation, phone: gd.phone, email: gd.email, isPrimary: gd.isPrimary };
    if (gd.id && keep.has(gd.id)) await store.update('guardians', gd.id, fields);
    else await store.insert('guardians', [{ id: newId('grd'), studentId, ...fields, userId: '' }]);
  }
}
