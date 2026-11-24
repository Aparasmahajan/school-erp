import type { Heartbeat, SchemaSpec } from '@school/core';

/**
 * The Control console's own spreadsheet: a register of every onboarded school, their
 * health reports and their audit trails. It holds NO student or guardian data; schools
 * only send ids, counts and action names (see packages/core/src/telemetry.ts).
 */

export type AdminRole = 'OWNER' | 'VIEWER';
export type SchoolStatus = 'ONBOARDING' | 'LIVE' | 'SUSPENDED' | 'OFFBOARDED';

/** People who can sign in to the console. OWNER changes things; VIEWER only looks. */
export interface AdminRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  createdBy: string;
  lastLoginAt: string;
}

export interface SchoolRecord {
  id: string;
  code: string;
  name: string;
  city: string;
  board: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** Where the school's own app is reached, for a quick link. */
  appUrl: string;
  plan: string;
  status: SchoolStatus;
  /** SHA-256 of the install key. The key itself is shown once and never stored. */
  keyHash: string;
  keyPrefix: string;
  keyRotatedAt: string;
  onboardedAt: string;
  notes: string;
  createdAt: string;
  createdBy: string;
  lastSeenAt: string;
  appVersion: string;
  schemaVersion: number | null;
  /** The latest heartbeat, minus the school id. */
  snapshot: Partial<Heartbeat> | null;
}

/** Health history: at most one row per school per HEARTBEAT_HISTORY_MINUTES. */
export interface HeartbeatRow {
  id: string;
  schoolId: string;
  at: string;
  appVersion: string;
  students: number | null;
  staff: number | null;
  sections: number | null;
  sectionsMarked: number | null;
  presentPct: number | null;
  staffCheckedIn: number | null;
  errors: number | null;
  queued: number | null;
  dropped: number | null;
  uptimeS: number | null;
  storage: string;
}

/** One row per audit event or server error a school reported. */
export interface EventRow {
  id: string;
  schoolId: string;
  at: string;
  receivedAt: string;
  kind: 'audit' | 'error';
  action: string;
  entity: string;
  entityId: string;
  actorId: string;
  actorRoles: string[] | null;
  detail: Record<string, unknown> | null;
}

/** What console users did: onboarding, key rotation, status changes, admin changes. */
export interface ConsoleAuditRow {
  id: string;
  at: string;
  adminId: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

export interface ControlTables {
  admins: AdminRow;
  schools: SchoolRecord;
  heartbeats: HeartbeatRow;
  events: EventRow;
  console_audit: ConsoleAuditRow;
}

export const CONTROL_TABLES: SchemaSpec<ControlTables> = {
  admins: {
    id: 'string', email: 'string', name: 'string', passwordHash: 'string', role: 'string', status: 'string',
    createdAt: 'string', createdBy: 'string', lastLoginAt: 'string',
  },
  schools: {
    id: 'string', code: 'string', name: 'string', city: 'string', board: 'string', contactName: 'string',
    contactEmail: 'string', contactPhone: 'string', appUrl: 'string', plan: 'string', status: 'string',
    keyHash: 'string', keyPrefix: 'string', keyRotatedAt: 'string', onboardedAt: 'string', notes: 'string',
    createdAt: 'string', createdBy: 'string', lastSeenAt: 'string', appVersion: 'string',
    schemaVersion: 'number', snapshot: 'json',
  },
  heartbeats: {
    id: 'string', schoolId: 'string', at: 'string', appVersion: 'string', students: 'number', staff: 'number',
    sections: 'number', sectionsMarked: 'number', presentPct: 'number', staffCheckedIn: 'number',
    errors: 'number', queued: 'number', dropped: 'number', uptimeS: 'number', storage: 'string',
  },
  events: {
    id: 'string', schoolId: 'string', at: 'string', receivedAt: 'string', kind: 'string', action: 'string',
    entity: 'string', entityId: 'string', actorId: 'string', actorRoles: 'json', detail: 'json',
  },
  console_audit: {
    id: 'string', at: 'string', adminId: 'string', action: 'string', entity: 'string', entityId: 'string',
    before: 'json', after: 'json',
  },
};
