import type { Context } from 'hono';
import {
  can,
  defaultGrants,
  defaultSettings,
  hasCapability,
  isCapabilityId,
  isReach,
  isRoleKey,
  newId,
  reachesFor,
  sectionLabel,
  settingsFromRows,
  type Actor,
  type AuditRow,
  type CapabilityId,
  type ClassRow,
  type Grant,
  type SchoolSettings,
  type SectionRow,
  type Target,
  type UserRow,
  type UserRoleRow,
} from '@school/core';
import type { Config } from './config';
import { HttpError } from './lib/errors';
import type { Store } from './store';

export interface Deps {
  store: Store;
  config: Config;
}

export type AppEnv = { Variables: { actor: Actor; user: UserRow; grants: Grant[] } };
export type Ctx = Context<AppEnv>;

/** The permission matrix. Falls back to the built-in defaults only when the table is empty. */
export async function loadGrants(store: Store): Promise<Grant[]> {
  const rows = await store.all('role_grants');
  if (rows.length === 0) return defaultGrants();
  return rows
    .filter((r) => isRoleKey(r.role) && isCapabilityId(r.capability) && isReach(r.reach))
    .map((r) => ({ role: r.role, capability: r.capability, reach: r.reach }));
}

export function isActiveRole(r: UserRoleRow, nowIso = new Date().toISOString()): boolean {
  return (!r.validFrom || r.validFrom <= nowIso) && (!r.validTo || r.validTo > nowIso);
}

export function activeRolesOf(rows: UserRoleRow[], userId: string): UserRoleRow['role'][] {
  const now = new Date().toISOString();
  return [...new Set(rows.filter((r) => r.userId === userId && isActiveRole(r, now)).map((r) => r.role))];
}

/** Built from stored data on every request. Nothing here comes from the request body. */
export async function loadActor(store: Store, userId: string): Promise<Actor> {
  const [userRoles, sections, teaching, guardians] = await Promise.all([
    store.all('user_roles'),
    store.all('sections'),
    store.all('teaching'),
    store.all('guardians'),
  ]);
  return {
    userId,
    roles: activeRolesOf(userRoles, userId),
    classTeacherOf: sections.filter((s) => s.classTeacherId === userId).map((s) => s.id),
    teaches: [...new Set(teaching.filter((t) => t.userId === userId).map((t) => t.sectionId))],
    children: guardians.filter((g) => g.userId === userId).map((g) => g.studentId),
  };
}

export async function getSettings(store: Store, config: Config): Promise<SchoolSettings> {
  return settingsFromRows(await store.all('settings'), { ...defaultSettings(), timezone: config.defaultTimezone });
}

export const SCHOOL: Target = { kind: 'school' };

/** Permission helpers bound to the signed-in person. */
export function guard(c: Ctx) {
  const actor = c.get('actor');
  const grants = c.get('grants');
  return {
    actor,
    grants,
    can: (capability: CapabilityId, target: Target) => can(actor, capability, target, grants),
    has: (capability: CapabilityId) => hasCapability(actor, capability, grants),
    reaches: (capability: CapabilityId) => reachesFor(actor, capability, grants),
    require(capability: CapabilityId, target: Target, message = "You don't have permission to do that."): void {
      if (!can(actor, capability, target, grants)) throw new HttpError(403, message);
    },
  };
}

export function publicUser(u: UserRow) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, lastLoginAt: u.lastLoginAt };
}

export function sectionLabels(sections: SectionRow[], classes: ClassRow[]): Map<string, string> {
  const className = new Map(classes.map((c) => [c.id, c.name]));
  return new Map(sections.map((s) => [s.id, sectionLabel(className.get(s.classId) ?? '?', s.name)]));
}

// ── listeners (used by telemetry to forward audit events and server errors) ──

const listeners = new WeakMap<Store, { audit: ((row: AuditRow) => void)[]; error: ((err: unknown) => void)[] }>();

function listenersOf(store: Store) {
  let bag = listeners.get(store);
  if (!bag) {
    bag = { audit: [], error: [] };
    listeners.set(store, bag);
  }
  return bag;
}

export function onAudit(store: Store, fn: (row: AuditRow) => void): void {
  listenersOf(store).audit.push(fn);
}

export function onServerError(store: Store, fn: (err: unknown) => void): void {
  listenersOf(store).error.push(fn);
}

export function emitServerError(store: Store, err: unknown): void {
  for (const fn of listenersOf(store).error) {
    try {
      fn(err);
    } catch {
      /* a listener must never break error handling */
    }
  }
}

/**
 * Append an audit row. A failure is logged, not thrown: the change it describes has
 * already happened and the person should not be told it failed.
 */
export async function audit(store: Store, entry: Omit<AuditRow, 'id' | 'at'>): Promise<void> {
  const row: AuditRow = { id: newId('aud'), at: new Date().toISOString(), ...entry };
  try {
    await store.insert('audit', [row]);
  } catch (err) {
    console.error('[audit] could not write audit row', err);
  }
  for (const fn of listenersOf(store).audit) {
    try {
      fn(row);
    } catch {
      /* forwarding is best-effort */
    }
  }
}
