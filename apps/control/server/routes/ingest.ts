import { Hono } from 'hono';
import { cleanDetail, heartbeatInput, ingestEventsInput } from '@school/core';
import { HttpError, RateLimiter, readBody } from '@school/server';
import { consoleAudit, type ControlEnv, type Deps } from '../context';
import { keyMatches } from '../keys';
import type { EventRow, SchoolRecord } from '../schema';

/**
 * Where school installs report in. Not a console session: each request carries the
 * school's install key, and a report can only ever be filed under that school.
 *
 * Detail is stripped to the privacy allow-list again here, so a buggy or outdated school
 * can't put personal data into the shared register.
 */
export function ingestRoutes({ store, config }: Deps) {
  const r = new Hono<ControlEnv>();
  const limiter = new RateLimiter(120, 60_000);
  /** Recent event ids, so a retried batch isn't stored twice. */
  const seen = new Set<string>();
  const lastHistory = new Map<string, number>();

  async function authorise(authHeader: string | undefined, schoolId: string): Promise<SchoolRecord> {
    const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const school = (await store.all('schools')).find((s) => s.id === schoolId);
    if (!school || !keyMatches(key, school.keyHash)) throw new HttpError(401, 'Unknown school or install key.');
    if (school.status === 'OFFBOARDED') throw new HttpError(403, 'This school has been offboarded.');
    if (!limiter.allow(school.id)) throw new HttpError(429, 'Too many reports; slow down.');
    return school;
  }

  r.post('/heartbeat', async (c) => {
    const body = await readBody(c, heartbeatInput);
    const school = await authorise(c.req.header('authorization'), body.schoolId);
    const now = new Date().toISOString();
    const { schoolId: _id, ...snapshot } = body;

    const wentLive = school.status === 'ONBOARDING';
    await store.update('schools', school.id, {
      lastSeenAt: now,
      appVersion: body.appVersion,
      schemaVersion: body.schemaVersion,
      snapshot,
      ...(wentLive ? { status: 'LIVE' as const, onboardedAt: school.onboardedAt || now } : {}),
    });
    if (wentLive) {
      await consoleAudit(store, { adminId: 'system', action: 'school.went_live', entity: 'school', entityId: school.id, before: { status: 'ONBOARDING' }, after: { status: 'LIVE' } });
    }

    // History: at most one row per school per interval; the latest is always on the school row.
    if (!lastHistory.has(school.id)) {
      const mine = (await store.all('heartbeats')).filter((h) => h.schoolId === school.id);
      lastHistory.set(school.id, Math.max(0, ...mine.map((h) => Date.parse(h.at) || 0)));
    }
    if (Date.now() - (lastHistory.get(school.id) ?? 0) >= config.historyEveryMs) {
      lastHistory.set(school.id, Date.now());
      await store.insert('heartbeats', [
        {
          id: `hb_${school.id}_${Date.now().toString(36)}`,
          schoolId: school.id,
          at: now,
          appVersion: body.appVersion,
          students: body.students,
          staff: body.staff,
          sections: body.sections,
          sectionsMarked: body.sectionsMarked,
          presentPct: body.presentPct,
          staffCheckedIn: body.staffCheckedIn,
          errors: body.errors,
          queued: body.queued,
          dropped: body.dropped,
          uptimeS: body.uptimeS,
          storage: body.storage,
        },
      ]);
    }
    return c.json({ ok: true });
  });

  r.post('/events', async (c) => {
    const body = await readBody(c, ingestEventsInput);
    const school = await authorise(c.req.header('authorization'), body.schoolId);
    const receivedAt = new Date().toISOString();
    const fresh = body.events.filter((e) => !seen.has(`${school.id}:${e.id}`));
    const rows: EventRow[] = fresh.map((e) => ({
      id: e.id,
      schoolId: school.id,
      at: e.at,
      receivedAt,
      kind: e.kind,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      actorId: e.actorId,
      actorRoles: e.actorRoles,
      detail: cleanDetail(e.kind, e.detail),
    }));
    await store.insert('events', rows);
    for (const e of fresh) seen.add(`${school.id}:${e.id}`);
    if (seen.size > 100_000) seen.clear();
    return c.json({ accepted: rows.length, duplicates: body.events.length - rows.length });
  });

  return r;
}
