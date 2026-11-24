import { SETTING_KEYS, defaultGrants, defaultSettings, newId, type SchoolSettings } from '@school/core';
import type { Store } from '../store';

export interface BaseSeedOptions {
  schoolName?: string;
  timezone?: string;
  principal?: { name: string; email: string };
}

/**
 * Everything a new school needs before anyone signs in: settings, the default permission
 * matrix, and (optionally) the first principal as an invited account. Idempotent: running
 * it again never overwrites what's there.
 */
export async function seedBase(
  store: Store,
  opts: BaseSeedOptions = {}
): Promise<{ principalId?: string; createdPrincipal: boolean }> {
  await store.ensureSchema();
  const now = new Date().toISOString();

  const settings: SchoolSettings = {
    ...defaultSettings(),
    ...(opts.schoolName ? { schoolName: opts.schoolName } : {}),
    ...(opts.timezone ? { timezone: opts.timezone } : {}),
  };
  const existing = await store.all('settings');
  await store.insert(
    'settings',
    SETTING_KEYS.filter((k) => !existing.some((r) => r.id === k)).map((k) => ({
      id: k,
      value: String(settings[k]),
      updatedAt: now,
      updatedBy: 'setup',
    }))
  );

  if ((await store.all('role_grants')).length === 0) {
    await store.insert('role_grants', defaultGrants().map((g) => ({ id: newId('rg'), ...g })));
  }

  if (!opts.principal) return { createdPrincipal: false };
  const email = opts.principal.email.trim().toLowerCase();
  const found = (await store.all('users')).find((u) => u.email.toLowerCase() === email);
  if (found) return { principalId: found.id, createdPrincipal: false };

  const id = newId('usr');
  await store.insert('users', [
    {
      id,
      email,
      name: opts.principal.name.trim(),
      phone: '',
      passwordHash: '',
      status: 'INVITED',
      createdAt: now,
      createdBy: 'setup',
      lastLoginAt: '',
    },
  ]);
  await store.insert('user_roles', [
    { id: newId('ur'), userId: id, role: 'PRINCIPAL', validFrom: now, validTo: '', assignedBy: 'setup', assignedAt: now },
  ]);
  return { principalId: id, createdPrincipal: true };
}
