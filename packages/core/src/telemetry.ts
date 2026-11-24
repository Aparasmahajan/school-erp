import { z } from 'zod';

/**
 * What a school install tells the Control console, and what it must NOT.
 *
 * Each school is its own island (own server, own data). The Control console only needs
 * to know what happened and whether the school is healthy, never WHO the students are.
 * So audit details pass through an allow-list: ids, dates, counts, statuses and roles
 * leave the school; names, emails, phone numbers, coordinates and attendance marks don't.
 * Both sides apply it: the school before sending, the Control console again on receipt.
 */

/** Bumped when the school storage schema changes; reported in heartbeats. */
export const SCHEMA_VERSION = 1;

const SAFE_KEYS = [
  'date', 'sectionId', 'classId', 'status', 'roles', 'role', 'present', 'absent', 'late', 'leave',
  'changed', 'created', 'zoneId', 'distanceM', 'accuracyM', 'radiusM', 'active', 'sortOrder',
] as const;

function pickSafe(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of SAFE_KEYS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string' && v.length <= 60) out[key] = v;
    else if (Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === 'string' && x.length <= 40)) out[key] = v;
  }
  // Lists of objects (e.g. permission changes) leave only as a count.
  for (const [key, v] of Object.entries(src)) {
    if (Array.isArray(v) && v.some((x) => typeof x === 'object')) out[`${key}Count`] = v.length;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Strip an audit entry's before/after down to the allow-list. */
export function safeDetail(before: unknown, after: unknown): Record<string, unknown> {
  const detail: Record<string, unknown> = {};
  const b = pickSafe(before);
  const a = pickSafe(after);
  if (b) detail.before = b;
  if (a) detail.after = a;
  return detail;
}

/** Re-applied by the Control console to whatever arrives, in case a sender is buggy or old. */
export function cleanDetail(kind: 'audit' | 'error', detail: Record<string, unknown>): Record<string, unknown> {
  if (kind === 'error') {
    const message = typeof detail.message === 'string' ? detail.message.slice(0, 200) : '';
    return message ? { message } : {};
  }
  return safeDetail(detail.before, detail.after);
}

const id = z.string().min(1).max(60);
const count = z.number().int().min(0).max(10_000_000);

export const telemetryEvent = z.strictObject({
  id,
  at: z.string().max(40),
  kind: z.enum(['audit', 'error']),
  action: z.string().max(60),
  entity: z.string().max(40),
  entityId: z.string().max(60),
  actorId: z.string().max(60),
  actorRoles: z.array(z.string().max(30)).max(10),
  detail: z.record(z.string(), z.unknown()).refine((d) => JSON.stringify(d).length <= 2000, 'detail too large'),
});

export const ingestEventsInput = z.strictObject({
  schoolId: id,
  events: z.array(telemetryEvent).min(1).max(500),
});

export const heartbeatInput = z.strictObject({
  schoolId: id,
  at: z.string().max(40),
  appVersion: z.string().max(20),
  schemaVersion: z.number().int().min(0).max(10_000),
  storage: z.enum(['sheets', 'file', 'memory']),
  schoolName: z.string().max(120),
  timezone: z.string().max(60),
  students: count,
  staff: count,
  sections: count,
  sectionsMarked: count,
  presentPct: z.number().min(0).max(100).nullable(),
  staffCheckedIn: count,
  errors: count,
  queued: count,
  dropped: count,
  uptimeS: count,
});

export type TelemetryEvent = z.infer<typeof telemetryEvent>;
export type Heartbeat = z.infer<typeof heartbeatInput>;
