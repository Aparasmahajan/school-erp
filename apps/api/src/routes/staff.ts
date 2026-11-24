import { Hono } from 'hono';
import {
  STAFF_ROLE_KEYS,
  createStaffInput,
  newId,
  updateStaffInput,
  type RoleKey,
  type UserRow,
} from '@school/core';
import { signInvite } from '../auth/tokens';
import { SCHOOL, activeRolesOf, audit, guard, publicUser, sectionLabels, type AppEnv, type Deps } from '../context';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { readBody } from '../lib/http';

export function staffRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  const inviteUrl = async (userId: string) =>
    `${config.publicUrl}/accept-invite?token=${encodeURIComponent(await signInvite(userId, config.sessionSecret))}`;

  r.get('/', async (c) => {
    const g = guard(c);
    if (!g.has('staff.view')) throw forbidden("You can't see the staff list.");
    const [users, userRoles, sections, classes] = await Promise.all([
      store.all('users'),
      store.all('user_roles'),
      store.all('sections'),
      store.all('classes'),
    ]);
    const labels = sectionLabels(sections, classes);
    const staff = users
      .map((u) => ({ u, roles: activeRolesOf(userRoles, u.id) }))
      .filter(({ roles }) => roles.length === 0 || roles.some((r) => STAFF_ROLE_KEYS.includes(r)))
      .filter(({ u }) => g.can('staff.view', { kind: 'user', userId: u.id }))
      .map(({ u, roles }) => ({
        ...publicUser(u),
        roles,
        classTeacherOf: sections.filter((s) => s.classTeacherId === u.id).map((s) => labels.get(s.id) ?? ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ staff, canManage: g.can('staff.manage', SCHOOL), canManagePrincipal: g.can('roles.manage', SCHOOL) });
  });

  r.post('/', async (c) => {
    const g = guard(c);
    g.require('staff.manage', SCHOOL, "You can't add staff.");
    const body = await readBody(c, createStaffInput);
    if (body.roles.includes('PRINCIPAL') && !g.can('roles.manage', SCHOOL)) {
      throw forbidden('Only someone who can change roles and access can make another Principal.');
    }
    const user = await store.exclusive(async () => {
      const users = await store.all('users');
      if (users.some((u) => u.email.toLowerCase() === body.email)) throw conflict(`${body.email} already has an account.`);
      const now = new Date().toISOString();
      const row: UserRow = {
        id: newId('usr'),
        email: body.email,
        name: body.name,
        phone: body.phone,
        passwordHash: '',
        status: 'INVITED',
        createdAt: now,
        createdBy: g.actor.userId,
        lastLoginAt: '',
      };
      await store.insert('users', [row]);
      await store.insert(
        'user_roles',
        [...new Set(body.roles)].map((role) => ({
          id: newId('ur'), userId: row.id, role, validFrom: now, validTo: '', assignedBy: g.actor.userId, assignedAt: now,
        }))
      );
      return row;
    });
    await audit(store, { actorId: g.actor.userId, action: 'staff.invite', entity: 'user', entityId: user.id, before: null, after: { name: user.name, email: user.email, roles: body.roles } });
    // Email/SMS delivery isn't wired up yet, so the link is handed back to pass on.
    return c.json({ id: user.id, inviteUrl: await inviteUrl(user.id) }, 201);
  });

  r.patch('/:id', async (c) => {
    const g = guard(c);
    g.require('staff.manage', SCHOOL, "You can't change staff accounts.");
    const body = await readBody(c, updateStaffInput);
    const id = c.req.param('id');

    const result = await store.exclusive(async () => {
      const [users, userRoles] = await Promise.all([store.all('users'), store.all('user_roles')]);
      const target = users.find((u) => u.id === id);
      if (!target) throw notFound('No such staff member.');
      const current = activeRolesOf(userRoles, id);
      const canPrincipal = g.can('roles.manage', SCHOOL);

      if (current.includes('PRINCIPAL') && !canPrincipal) throw forbidden('Only someone who can change roles and access can change a Principal’s account.');
      if (id === g.actor.userId && (body.roles || body.status)) {
        throw badRequest("You can't change your own roles or suspend yourself. Ask another administrator.");
      }

      const activePrincipals = users.filter((u) => u.status === 'ACTIVE' && activeRolesOf(userRoles, u.id).includes('PRINCIPAL'));
      const isLastPrincipal = current.includes('PRINCIPAL') && activePrincipals.length <= 1 && target.status === 'ACTIVE';

      let added: RoleKey[] = [];
      let removed: RoleKey[] = [];
      if (body.roles) {
        const wanted = [...new Set(body.roles)];
        added = wanted.filter((r) => !current.includes(r));
        removed = current.filter((r) => !wanted.includes(r));
        if ((added.includes('PRINCIPAL') || removed.includes('PRINCIPAL')) && !canPrincipal) {
          throw forbidden('Only someone who can change roles and access can add or remove the Principal role.');
        }
        if (removed.includes('PRINCIPAL') && isLastPrincipal) throw badRequest('The school must keep at least one active Principal.');
      }
      if (body.status === 'SUSPENDED' && isLastPrincipal) throw badRequest('The school must keep at least one active Principal.');
      if (body.status === 'ACTIVE' && !target.passwordHash) throw badRequest("They haven't accepted their invite yet.");

      const now = new Date().toISOString();
      for (const role of removed) {
        for (const row of userRoles.filter((x) => x.userId === id && x.role === role && (!x.validTo || x.validTo > now))) {
          await store.update('user_roles', row.id, { validTo: now });
        }
      }
      if (added.length) {
        await store.insert(
          'user_roles',
          added.map((role) => ({ id: newId('ur'), userId: id, role, validFrom: now, validTo: '', assignedBy: g.actor.userId, assignedAt: now }))
        );
      }
      const fields: Partial<UserRow> = {};
      if (body.name !== undefined) fields.name = body.name;
      if (body.phone !== undefined) fields.phone = body.phone;
      if (body.status !== undefined) fields.status = body.status;
      const updated = Object.keys(fields).length ? await store.update('users', id, fields) : target;
      return { before: { ...publicUser(target), roles: current }, after: { ...publicUser(updated!), roles: body.roles ?? current } };
    });

    await audit(store, { actorId: g.actor.userId, action: 'staff.update', entity: 'user', entityId: id, ...result });
    return c.json({ ok: true });
  });

  r.post('/:id/invite', async (c) => {
    const g = guard(c);
    g.require('staff.manage', SCHOOL, "You can't send invites.");
    const target = (await store.all('users')).find((u) => u.id === c.req.param('id'));
    if (!target) throw notFound('No such staff member.');
    if (target.passwordHash || target.status !== 'INVITED') throw new HttpError(409, 'They have already set a password.');
    return c.json({ inviteUrl: await inviteUrl(target.id) });
  });

  return r;
}
