import type { Context } from 'hono';
import { newId } from '@school/core';
import { HttpError } from '@school/server';
import type { ControlConfig } from './config';
import type { AdminRow, ConsoleAuditRow, SchoolRecord } from './schema';
import type { ControlStore } from './store';

export interface Deps {
  store: ControlStore;
  config: ControlConfig;
}

export type ControlEnv = { Variables: { admin: AdminRow } };
export type Ctx = Context<ControlEnv>;

/** Changing anything needs OWNER; VIEWER is read-only everywhere. */
export function requireOwner(c: Ctx): AdminRow {
  const admin = c.get('admin');
  if (admin.role !== 'OWNER') throw new HttpError(403, 'Only console owners can change this.');
  return admin;
}

export function publicAdmin(a: AdminRow) {
  return { id: a.id, email: a.email, name: a.name, role: a.role, status: a.status, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt };
}

/** A school record without its key hash. Never send keyHash to a browser. */
export function publicSchool(s: SchoolRecord) {
  const { keyHash: _hidden, ...rest } = s;
  return rest;
}

export async function consoleAudit(store: ControlStore, entry: Omit<ConsoleAuditRow, 'id' | 'at'>): Promise<void> {
  try {
    await store.insert('console_audit', [{ id: newId('cau'), at: new Date().toISOString(), ...entry }]);
  } catch (err) {
    console.error('[console audit] could not write', err);
  }
}
