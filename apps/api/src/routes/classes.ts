import { Hono } from 'hono';
import {
  STAFF_ROLE_KEYS,
  createClassInput,
  createSectionInput,
  newId,
  sectionLabel,
  teachingInput,
  updateSectionInput,
  type RoleKey,
  type Target,
} from '@school/core';
import { SCHOOL, activeRolesOf, audit, guard, type AppEnv, type Deps } from '../context';
import { badRequest, conflict, notFound } from '../lib/errors';
import { readBody } from '../lib/http';
import { ensureRole } from '../lib/roles';
import type { Store } from '../store';

const MANAGE_MSG = "You can't manage classes.";

/** The user must exist, not be suspended, and hold at least one staff role. */
async function assertStaff(store: Store, userId: string): Promise<{ id: string; name: string }> {
  const [users, userRoles] = await Promise.all([store.all('users'), store.all('user_roles')]);
  const user = users.find((u) => u.id === userId);
  if (!user || user.status === 'SUSPENDED') throw badRequest('Choose a current member of staff.');
  const roles = activeRolesOf(userRoles, userId);
  if (!roles.some((r) => STAFF_ROLE_KEYS.includes(r))) throw badRequest(`${user.name} is not on the staff list.`);
  return user;
}

export function classesRoutes({ store }: Deps) {
  const r = new Hono<AppEnv>();

  /**
   * Classes and the sections this person may see. A section name isn't sensitive, but a
   * parent has no business browsing the school's structure, so sections are filtered too.
   */
  r.get('/', async (c) => {
    const g = guard(c);
    const [classes, sections, users, teaching, students] = await Promise.all([
      store.all('classes'),
      store.all('sections'),
      store.all('users'),
      store.all('teaching'),
      store.all('students'),
    ]);
    const manage = g.can('classes.manage', SCHOOL);
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const activeCount = new Map<string, number>();
    for (const s of students) if (s.status === 'ACTIVE') activeCount.set(s.sectionId, (activeCount.get(s.sectionId) ?? 0) + 1);

    const sorted = [...classes].sort(
      (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    const out = sorted
      .map((cls) => ({
        id: cls.id,
        name: cls.name,
        sortOrder: cls.sortOrder,
        sections: sections
          .filter((s) => s.classId === cls.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => {
            const t: Target = { kind: 'section', sectionId: s.id };
            const flags = {
              canViewStudents: g.can('students.view', t),
              canEditStudents: g.can('students.edit', t),
              canViewAttendance: g.can('attendance.view', t),
              canMarkAttendance: g.can('attendance.mark', t),
              canAmendAttendance: g.can('attendance.amend', t),
            };
            if (!manage && !Object.values(flags).some(Boolean)) return null;
            return {
              id: s.id,
              name: s.name,
              label: sectionLabel(cls.name, s.name),
              room: s.room,
              classTeacherId: s.classTeacherId,
              classTeacherName: nameOf.get(s.classTeacherId) ?? '',
              studentCount: activeCount.get(s.id) ?? 0,
              ...flags,
              teachers: manage
                ? teaching
                    .filter((x) => x.sectionId === s.id)
                    .map((x) => ({ id: x.id, userId: x.userId, name: nameOf.get(x.userId) ?? '', subject: x.subject }))
                : [],
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null),
      }))
      .filter((cls) => manage || cls.sections.length > 0);

    return c.json({ classes: out, canManage: manage });
  });

  r.post('/', async (c) => {
    const g = guard(c);
    g.require('classes.manage', SCHOOL, MANAGE_MSG);
    const body = await readBody(c, createClassInput);
    const row = await store.exclusive(async () => {
      const classes = await store.all('classes');
      if (classes.some((x) => x.name.toLowerCase() === body.name.toLowerCase())) throw conflict(`${body.name} already exists.`);
      const created = { id: newId('cls'), name: body.name, sortOrder: body.sortOrder };
      await store.insert('classes', [created]);
      return created;
    });
    await audit(store, { actorId: g.actor.userId, action: 'class.create', entity: 'class', entityId: row.id, before: null, after: row });
    return c.json({ class: row }, 201);
  });

  /**
   * Assigning a class teacher also gives them the Class teacher role when the person
   * doing it may manage staff; otherwise the response says the role is still missing.
   */
  async function giveRoleIfAllowed(c: Parameters<typeof guard>[0], userId: string, role: RoleKey) {
    const g = guard(c);
    if (g.can('staff.manage', SCHOOL)) {
      const added = await ensureRole(store, userId, role, g.actor.userId);
      return { roleAdded: added, warning: '' };
    }
    const held = activeRolesOf(await store.all('user_roles'), userId);
    return {
      roleAdded: false,
      warning: held.includes(role) ? '' : `They don't have the ${role === 'CLASS_TEACHER' ? 'Class teacher' : 'Subject teacher'} role yet, so this gives them no access until someone who manages staff adds it.`,
    };
  }

  r.post('/sections', async (c) => {
    const g = guard(c);
    g.require('classes.manage', SCHOOL, MANAGE_MSG);
    const body = await readBody(c, createSectionInput);
    if (body.classTeacherId) await assertStaff(store, body.classTeacherId);
    const row = await store.exclusive(async () => {
      const [classes, sections] = await Promise.all([store.all('classes'), store.all('sections')]);
      if (!classes.some((x) => x.id === body.classId)) throw notFound('That class does not exist.');
      if (sections.some((s) => s.classId === body.classId && s.name.toLowerCase() === body.name.toLowerCase())) {
        throw conflict(`Section ${body.name} already exists in that class.`);
      }
      const created = { id: newId('sec'), ...body };
      await store.insert('sections', [created]);
      return created;
    });
    const role = body.classTeacherId ? await giveRoleIfAllowed(c, body.classTeacherId, 'CLASS_TEACHER') : { roleAdded: false, warning: '' };
    await audit(store, { actorId: g.actor.userId, action: 'section.create', entity: 'section', entityId: row.id, before: null, after: row });
    return c.json({ section: row, ...role }, 201);
  });

  r.patch('/sections/:id', async (c) => {
    const g = guard(c);
    g.require('classes.manage', SCHOOL, MANAGE_MSG);
    const body = await readBody(c, updateSectionInput);
    if (body.classTeacherId) await assertStaff(store, body.classTeacherId);
    const { before, after } = await store.exclusive(async () => {
      const sections = await store.all('sections');
      const current = sections.find((s) => s.id === c.req.param('id'));
      if (!current) throw notFound('That section does not exist.');
      if (
        body.name &&
        sections.some((s) => s.id !== current.id && s.classId === current.classId && s.name.toLowerCase() === body.name!.toLowerCase())
      ) {
        throw conflict(`Section ${body.name} already exists in that class.`);
      }
      const updated = await store.update('sections', current.id, body);
      return { before: current, after: updated! };
    });
    const role =
      body.classTeacherId && body.classTeacherId !== before.classTeacherId
        ? await giveRoleIfAllowed(c, body.classTeacherId, 'CLASS_TEACHER')
        : { roleAdded: false, warning: '' };
    await audit(store, { actorId: g.actor.userId, action: 'section.update', entity: 'section', entityId: after.id, before, after });
    return c.json({ section: after, ...role });
  });

  r.post('/teaching', async (c) => {
    const g = guard(c);
    g.require('classes.manage', SCHOOL, MANAGE_MSG);
    const body = await readBody(c, teachingInput);
    await assertStaff(store, body.userId);
    const row = await store.exclusive(async () => {
      const [sections, teaching] = await Promise.all([store.all('sections'), store.all('teaching')]);
      if (!sections.some((s) => s.id === body.sectionId)) throw notFound('That section does not exist.');
      if (teaching.some((t) => t.userId === body.userId && t.sectionId === body.sectionId && t.subject.toLowerCase() === body.subject.toLowerCase())) {
        throw conflict('That teaching assignment already exists.');
      }
      const created = { id: newId('tch'), ...body };
      await store.insert('teaching', [created]);
      return created;
    });
    const role = await giveRoleIfAllowed(c, body.userId, 'SUBJECT_TEACHER');
    await audit(store, { actorId: g.actor.userId, action: 'teaching.create', entity: 'teaching', entityId: row.id, before: null, after: row });
    return c.json({ teaching: row, ...role }, 201);
  });

  r.delete('/teaching/:id', async (c) => {
    const g = guard(c);
    g.require('classes.manage', SCHOOL, MANAGE_MSG);
    const id = c.req.param('id');
    const existing = (await store.all('teaching')).find((t) => t.id === id);
    if (!existing || !(await store.remove('teaching', id))) throw notFound('That teaching assignment does not exist.');
    await audit(store, { actorId: g.actor.userId, action: 'teaching.delete', entity: 'teaching', entityId: id, before: existing, after: null });
    return c.json({ ok: true });
  });

  return r;
}
