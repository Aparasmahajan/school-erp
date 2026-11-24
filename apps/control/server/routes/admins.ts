import { Hono } from 'hono';
import { newId } from '@school/core';
import { badRequest, conflict, HttpError, notFound, readBody } from '@school/server';
import { signInvite } from '../auth';
import { consoleAudit, publicAdmin, requireOwner, type ControlEnv, type Deps } from '../context';
import { createAdminInput, updateAdminInput } from '../inputs';
import type { AdminRow } from '../schema';

/** Console users. Owners manage them; there must always be one active owner. */
export function adminsRoutes({ store, config }: Deps) {
  const r = new Hono<ControlEnv>();
  const inviteUrl = async (id: string) =>
    `${config.publicUrl}/accept-invite?token=${encodeURIComponent(await signInvite(id, config.sessionSecret))}`;

  r.get('/', async (c) => {
    requireOwner(c);
    const admins = await store.all('admins');
    return c.json({ admins: admins.map(publicAdmin).sort((a, b) => a.name.localeCompare(b.name)) });
  });

  r.post('/', async (c) => {
    const me = requireOwner(c);
    const body = await readBody(c, createAdminInput);
    const admin = await store.exclusive(async () => {
      if ((await store.all('admins')).some((a) => a.email.toLowerCase() === body.email)) throw conflict(`${body.email} already has a console account.`);
      const row: AdminRow = {
        id: newId('adm'), email: body.email, name: body.name, passwordHash: '', role: body.role, status: 'INVITED',
        createdAt: new Date().toISOString(), createdBy: me.id, lastLoginAt: '',
      };
      await store.insert('admins', [row]);
      return row;
    });
    await consoleAudit(store, { adminId: me.id, action: 'admin.invite', entity: 'admin', entityId: admin.id, before: null, after: publicAdmin(admin) });
    return c.json({ admin: publicAdmin(admin), inviteUrl: await inviteUrl(admin.id) }, 201);
  });

  r.patch('/:id', async (c) => {
    const me = requireOwner(c);
    const body = await readBody(c, updateAdminInput);
    const id = c.req.param('id');
    if (id === me.id && (body.role || body.status)) throw badRequest("You can't change your own role or suspend yourself.");
    const { before, after } = await store.exclusive(async () => {
      const admins = await store.all('admins');
      const target = admins.find((a) => a.id === id);
      if (!target) throw notFound('No such console user.');
      const owners = admins.filter((a) => a.role === 'OWNER' && a.status === 'ACTIVE');
      const losingOwner = target.role === 'OWNER' && target.status === 'ACTIVE' && (body.role === 'VIEWER' || body.status === 'SUSPENDED');
      if (losingOwner && owners.length <= 1) throw badRequest('There must always be at least one active owner.');
      if (body.status === 'ACTIVE' && !target.passwordHash) throw badRequest("They haven't accepted their invite yet.");
      const updated = await store.update('admins', id, body);
      return { before: publicAdmin(target), after: publicAdmin(updated!) };
    });
    await consoleAudit(store, { adminId: me.id, action: 'admin.update', entity: 'admin', entityId: id, before, after });
    return c.json({ admin: after });
  });

  r.post('/:id/invite', async (c) => {
    requireOwner(c);
    const target = (await store.all('admins')).find((a) => a.id === c.req.param('id'));
    if (!target) throw notFound('No such console user.');
    if (target.passwordHash) throw new HttpError(409, 'They have already set a password.');
    return c.json({ inviteUrl: await inviteUrl(target.id) });
  });

  /** What console users did. */
  r.get('/activity', async (c) => {
    requireOwner(c);
    const [rows, admins, schools] = await Promise.all([store.all('console_audit'), store.all('admins'), store.all('schools')]);
    const adminName = new Map(admins.map((a) => [a.id, a.name]));
    const schoolName = new Map(schools.map((s) => [s.id, s.name]));
    return c.json({
      activity: rows
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 300)
        .map((x) => ({
          id: x.id,
          at: x.at,
          action: x.action,
          adminName: x.adminId === 'system' ? 'System' : adminName.get(x.adminId) ?? x.adminId,
          entity: x.entity,
          entityName: x.entity === 'school' ? schoolName.get(x.entityId) ?? x.entityId : x.entity === 'admin' ? adminName.get(x.entityId) ?? x.entityId : x.entityId,
        })),
    });
  });

  return r;
}
