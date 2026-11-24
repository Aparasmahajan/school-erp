import { newId, type RoleKey } from '@school/core';
import { activeRolesOf } from '../context';
import type { Store } from '../store';

/** Give `userId` a role if they don't already hold it. Returns true when added. */
export async function ensureRole(store: Store, userId: string, role: RoleKey, actorId: string): Promise<boolean> {
  const held = activeRolesOf(await store.all('user_roles'), userId);
  if (held.includes(role)) return false;
  const now = new Date().toISOString();
  await store.insert('user_roles', [
    { id: newId('ur'), userId, role, validFrom: now, validTo: '', assignedBy: actorId, assignedAt: now },
  ]);
  return true;
}
