import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Config } from '../config';
import { loadActor, loadGrants, type AppEnv, type Deps } from '../context';
import { HttpError } from '../lib/errors';
import { SESSION_TTL_SECONDS, passwordVersion, verifySession } from './tokens';

export const SESSION_COOKIE = 'sess';

/**
 * Routes reachable without signing in. EVERYTHING else under /api requires a valid
 * session; a new route is protected by default and must be added here to be public.
 * (The old ERP did the opposite: 15 routes had no check at all.)
 */
export const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/school',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/invite',
  'POST /api/auth/accept-invite',
]);

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function setSessionCookie(c: Context, token: string, config: Config): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

const SESSION_ENDED = 'Your session has ended. Please sign in again.';

export function authenticate({ store, config }: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const token = bearer || getCookie(c, SESSION_COOKIE);
    if (!token) throw new HttpError(401, 'Please sign in.');

    const claims = await verifySession(token, config.sessionSecret);
    if (!claims) throw new HttpError(401, SESSION_ENDED);

    // Re-checked on EVERY request: suspending someone or changing their password takes
    // effect immediately, not when their token expires.
    const user = (await store.all('users')).find((u) => u.id === claims.userId);
    if (!user || user.status !== 'ACTIVE' || !user.passwordHash || passwordVersion(user.passwordHash) !== claims.pv) {
      throw new HttpError(401, SESSION_ENDED);
    }

    // Cookies are sent automatically by browsers, so cookie-authenticated changes must
    // prove they came from our own pages: JSON only (HTML forms can't send it) and, when
    // the browser says where the request came from, it must be us.
    if (!bearer && MUTATING.has(c.req.method)) {
      const type = (c.req.header('content-type') ?? '').toLowerCase();
      if (!type.includes('application/json')) throw new HttpError(415, 'Send the request as JSON.');
      const origin = c.req.header('origin');
      if (origin) {
        const ours = new Set([new URL(c.req.url).origin, new URL(config.publicUrl).origin]);
        if (!ours.has(origin)) throw new HttpError(403, 'This request came from another website and was blocked.');
      }
    }

    const [actor, grants] = await Promise.all([loadActor(store, user.id), loadGrants(store)]);
    c.set('user', user);
    c.set('actor', actor);
    c.set('grants', grants);
    await next();
  };
}
