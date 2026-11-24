import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { acceptInviteInput, loginInput } from '@school/core';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/passwords';
import { RateLimiter } from '../auth/rateLimit';
import { SESSION_COOKIE, setSessionCookie } from '../auth/middleware';
import { passwordVersion, signSession, verifyInvite } from '../auth/tokens';
import { audit, getSettings, publicUser, type AppEnv, type Deps } from '../context';
import { HttpError } from '../lib/errors';
import { readBody } from '../lib/http';

const INVITE_GONE = 'This invite link has expired or was already used. Ask the school office for a new one.';

export function authRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();
  const limiter = new RateLimiter(10, 15 * 60_000);

  r.post('/login', async (c) => {
    const { email, password } = await readBody(c, loginInput);
    const key = email.trim().toLowerCase();
    if (!limiter.allow(key)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');

    const user = (await store.all('users')).find((u) => u.email.toLowerCase() === key);
    // Always run bcrypt, so the response time doesn't reveal whether the email exists.
    const matches = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !user.passwordHash || !matches) throw new HttpError(401, 'Email or password is incorrect.');
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'This account is not active. Contact the school office.');

    limiter.reset(key);
    await store.update('users', user.id, { lastLoginAt: new Date().toISOString() });
    const token = await signSession(user.id, passwordVersion(user.passwordHash), config.sessionSecret);
    setSessionCookie(c, token, config);
    // The token is also returned for the Windows app, which sends it as a Bearer header.
    return c.json({ user: publicUser(user), token });
  });

  r.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  r.get('/invite', async (c) => {
    const userId = await verifyInvite(c.req.query('token') ?? '', config.sessionSecret);
    const user = userId ? (await store.all('users')).find((u) => u.id === userId) : undefined;
    if (!user || user.passwordHash || user.status !== 'INVITED') throw new HttpError(410, INVITE_GONE);
    const settings = await getSettings(store, config);
    return c.json({ name: user.name, email: user.email, schoolName: settings.schoolName });
  });

  r.post('/accept-invite', async (c) => {
    const { token, password } = await readBody(c, acceptInviteInput);
    const userId = await verifyInvite(token, config.sessionSecret);
    if (!userId) throw new HttpError(410, INVITE_GONE);

    const passwordHash = await hashPassword(password);
    // Exclusive, and refuses if a password is already set: a leaked invite link can't be
    // replayed later to take over an account.
    const user = await store.exclusive(async () => {
      const u = (await store.all('users')).find((x) => x.id === userId);
      if (!u || u.passwordHash || u.status !== 'INVITED') throw new HttpError(410, INVITE_GONE);
      return store.update('users', u.id, { passwordHash, status: 'ACTIVE' });
    });
    if (!user) throw new HttpError(410, INVITE_GONE);

    await audit(store, {
      actorId: user.id,
      action: 'user.accept_invite',
      entity: 'user',
      entityId: user.id,
      before: { status: 'INVITED' },
      after: { status: 'ACTIVE' },
    });

    const session = await signSession(user.id, passwordVersion(passwordHash), config.sessionSecret);
    setSessionCookie(c, session, config);
    return c.json({ user: publicUser(user), token: session });
  });

  return r;
}
