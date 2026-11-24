import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { acceptInviteInput, loginInput } from '@school/core';
import { DUMMY_HASH, HttpError, RateLimiter, hashPassword, readBody, verifyPassword } from '@school/server';
import { CONSOLE_COOKIE, passwordVersion, setConsoleCookie, signSession, verifyInvite } from '../auth';
import { consoleAudit, publicAdmin, type ControlEnv, type Deps } from '../context';

const GONE = 'This invite link has expired or was already used. Ask a console owner for a new one.';

export function authRoutes({ store, config }: Deps) {
  const r = new Hono<ControlEnv>();
  const limiter = new RateLimiter(8, 15 * 60_000);

  r.post('/login', async (c) => {
    const { email, password } = await readBody(c, loginInput);
    const k = email.trim().toLowerCase();
    if (!limiter.allow(k)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const admin = (await store.all('admins')).find((a) => a.email.toLowerCase() === k);
    const ok = await verifyPassword(password, admin?.passwordHash || DUMMY_HASH);
    if (!admin || !admin.passwordHash || !ok) throw new HttpError(401, 'Email or password is incorrect.');
    if (admin.status !== 'ACTIVE') throw new HttpError(403, 'This console account is not active.');
    limiter.reset(k);
    await store.update('admins', admin.id, { lastLoginAt: new Date().toISOString() });
    const token = await signSession(admin.id, passwordVersion(admin.passwordHash), config.sessionSecret);
    setConsoleCookie(c, token, config);
    await consoleAudit(store, { adminId: admin.id, action: 'console.sign_in', entity: 'admin', entityId: admin.id, before: null, after: null });
    return c.json({ admin: publicAdmin(admin), token });
  });

  r.post('/logout', (c) => {
    deleteCookie(c, CONSOLE_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  r.get('/invite', async (c) => {
    const id = await verifyInvite(c.req.query('token') ?? '', config.sessionSecret);
    const admin = id ? (await store.all('admins')).find((a) => a.id === id) : undefined;
    if (!admin || admin.passwordHash || admin.status !== 'INVITED') throw new HttpError(410, GONE);
    return c.json({ name: admin.name, email: admin.email, role: admin.role });
  });

  r.post('/accept-invite', async (c) => {
    const { token, password } = await readBody(c, acceptInviteInput);
    const id = await verifyInvite(token, config.sessionSecret);
    if (!id) throw new HttpError(410, GONE);
    const passwordHash = await hashPassword(password);
    const admin = await store.exclusive(async () => {
      const a = (await store.all('admins')).find((x) => x.id === id);
      if (!a || a.passwordHash || a.status !== 'INVITED') throw new HttpError(410, GONE);
      return store.update('admins', a.id, { passwordHash, status: 'ACTIVE' });
    });
    if (!admin) throw new HttpError(410, GONE);
    await consoleAudit(store, { adminId: admin.id, action: 'admin.accept_invite', entity: 'admin', entityId: admin.id, before: { status: 'INVITED' }, after: { status: 'ACTIVE' } });
    const session = await signSession(admin.id, passwordVersion(passwordHash), config.sessionSecret);
    setConsoleCookie(c, session, config);
    return c.json({ admin: publicAdmin(admin), token: session });
  });

  return r;
}
