import { Hono } from 'hono';
import {
  CAPABILITIES,
  PROTECTED_GRANTS,
  ROLES,
  capabilityDef,
  grantsInput,
  newId,
  roleLabel,
  type Grant,
} from '@school/core';
import { SCHOOL, activeRolesOf, audit, guard, loadGrants, type AppEnv, type Deps } from '../context';
import { badRequest } from '../lib/errors';
import { readBody } from '../lib/http';

const key = (g: Pick<Grant, 'role' | 'capability'>) => `${g.role}|${g.capability}`;

export function rolesRoutes({ store }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const g = guard(c);
    g.require('roles.manage', SCHOOL, "You can't view roles and access.");
    const [grants, users, userRoles] = await Promise.all([loadGrants(store), store.all('users'), store.all('user_roles')]);
    const holders = new Map<string, number>();
    for (const u of users) {
      if (u.status === 'SUSPENDED') continue;
      for (const role of activeRolesOf(userRoles, u.id)) holders.set(role, (holders.get(role) ?? 0) + 1);
    }
    return c.json({
      roles: ROLES.map((role) => ({ ...role, holders: holders.get(role.key) ?? 0 })),
      capabilities: CAPABILITIES,
      grants,
      protected: PROTECTED_GRANTS,
    });
  });

  /** Replaces the whole matrix. Entries left out mean "no access". */
  r.put('/', async (c) => {
    const g = guard(c);
    g.require('roles.manage', SCHOOL, "You can't change roles and access.");
    const body = await readBody(c, grantsInput);

    const next = new Map<string, Grant>();
    for (const grant of body.grants) {
      const def = capabilityDef(grant.capability)!;
      if (!def.allowed.includes(grant.reach)) {
        throw badRequest(`"${def.label}" can't be given at "${grant.reach}" reach.`);
      }
      if (grant.reach === 'NONE') next.delete(key(grant));
      else next.set(key(grant), grant);
    }
    for (const p of PROTECTED_GRANTS) {
      if (next.get(key(p))?.reach !== p.reach) {
        throw badRequest(`${roleLabel(p.role)} must keep "${capabilityDef(p.capability)!.label}", so the school can't lock itself out.`);
      }
    }

    const before = await loadGrants(store);
    const rows = [...next.values()].map((gr) => ({ id: newId('rg'), ...gr }));
    await store.exclusive(() => store.replaceAll('role_grants', rows));

    const beforeKeys = new Map(before.map((b) => [key(b), b.reach]));
    const changes = [...new Set([...beforeKeys.keys(), ...next.keys()])]
      .filter((k) => beforeKeys.get(k) !== next.get(k)?.reach)
      .map((k) => ({ grant: k, from: beforeKeys.get(k) ?? 'NONE', to: next.get(k)?.reach ?? 'NONE' }));
    await audit(store, { actorId: g.actor.userId, action: 'roles.update', entity: 'role_grants', entityId: 'matrix', before: null, after: { changes } });
    return c.json({ grants: [...next.values()], changed: changes.length });
  });

  return r;
}
