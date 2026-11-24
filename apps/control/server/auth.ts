import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import { HttpError } from '@school/server';
import type { ControlConfig } from './config';
import type { ControlEnv, Deps } from './context';

/**
 * Console sign-in. Same rules as the school app (deny by default, session re-checked on
 * every request, JSON-only cookie writes, same-site origin) but separate secrets, cookie
 * and token audiences, so a school login can never open the console.
 */

export const CONSOLE_COOKIE = 'csess';
const SESSION_AUDIENCE = 'school-control:session';
const INVITE_AUDIENCE = 'school-control:invite';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Everything else under /api needs a console session. Ingest routes check a school key instead. */
export const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/invite',
  'POST /api/auth/accept-invite',
  'POST /api/ingest/heartbeat',
  'POST /api/ingest/events',
]);

const key = (secret: string) => new TextEncoder().encode(secret);
export const passwordVersion = (hash: string) => hash.slice(-12);

export async function signSession(adminId: string, pv: string, secret: string) {
  return new SignJWT({ pv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function signInvite(adminId: string, secret: string) {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(adminId).setAudience(INVITE_AUDIENCE).setIssuedAt().setExpirationTime('7d').sign(key(secret));
}

async function verify(token: string, secret: string, audience: string) {
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience, algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload : null;
  } catch {
    return null;
  }
}

export async function verifyInvite(token: string, secret: string): Promise<string | null> {
  return (await verify(token, secret, INVITE_AUDIENCE))?.sub ?? null;
}

export function setConsoleCookie(c: Context, token: string, config: ControlConfig) {
  setCookie(c, CONSOLE_COOKIE, token, { httpOnly: true, secure: config.cookieSecure, sameSite: 'Strict', path: '/', maxAge: SESSION_TTL_SECONDS });
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ENDED = 'Your session has ended. Please sign in again.';

export function authenticate({ store, config }: Deps): MiddlewareHandler<ControlEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const token = bearer || getCookie(c, CONSOLE_COOKIE);
    if (!token) throw new HttpError(401, 'Please sign in.');
    const claims = await verify(token, config.sessionSecret, SESSION_AUDIENCE);
    if (!claims) throw new HttpError(401, ENDED);
    const admin = (await store.all('admins')).find((a) => a.id === claims.sub);
    if (!admin || admin.status !== 'ACTIVE' || !admin.passwordHash || passwordVersion(admin.passwordHash) !== claims.pv) {
      throw new HttpError(401, ENDED);
    }
    if (!bearer && MUTATING.has(c.req.method)) {
      if (!(c.req.header('content-type') ?? '').toLowerCase().includes('application/json')) throw new HttpError(415, 'Send the request as JSON.');
      const origin = c.req.header('origin');
      if (origin && origin !== new URL(c.req.url).origin && origin !== new URL(config.publicUrl).origin) {
        throw new HttpError(403, 'This request came from another website and was blocked.');
      }
    }
    c.set('admin', admin);
    await next();
  };
}
