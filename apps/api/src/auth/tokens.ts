import { SignJWT, jwtVerify } from 'jose';

/**
 * Two token kinds, kept apart by audience so one can never be used as the other:
 *   session  12 h, carried in an httpOnly cookie (web) or a Bearer header (Windows app)
 *   invite   7 days, lets one specific person set their first password
 *
 * A session also carries `pv`, a fingerprint of the password hash. Changing or resetting
 * the password changes the hash, which ends every older session.
 */

const SESSION_AUDIENCE = 'school-erp:session';
const INVITE_AUDIENCE = 'school-erp:invite';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const INVITE_TTL = '7d';

const key = (secret: string) => new TextEncoder().encode(secret);

export function passwordVersion(passwordHash: string): string {
  return passwordHash.slice(-12);
}

export async function signSession(userId: string, pv: string, secret: string): Promise<string> {
  return new SignJWT({ pv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<{ userId: string; pv: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: SESSION_AUDIENCE, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.pv !== 'string') return null;
    return { userId: payload.sub, pv: payload.pv };
  } catch {
    return null;
  }
}

export async function signInvite(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience(INVITE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(INVITE_TTL)
    .sign(key(secret));
}

export async function verifyInvite(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience: INVITE_AUDIENCE, algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
