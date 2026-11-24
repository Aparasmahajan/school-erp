import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Install keys: one per school, proving that a report really comes from that school's
 * server. Shown once when created or rotated; only a SHA-256 hash is stored, so a copy of
 * the console's spreadsheet can't be used to impersonate a school. (A fast hash is fine
 * here: the key is 32 random bytes, not a guessable password.)
 */
export function newInstallKey(): string {
  return `ik_${randomBytes(32).toString('base64url')}`;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function keyMatches(key: string, storedHash: string): boolean {
  if (!key || !storedHash) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lines to paste into the school's apps/api/.env. */
export function envSnippet(ingestUrl: string, schoolId: string, key: string): string {
  return [`CONTROL_URL=${ingestUrl}`, `CONTROL_SCHOOL_ID=${schoolId}`, `CONTROL_INSTALL_KEY=${key}`].join('\n');
}
