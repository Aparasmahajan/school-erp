import { Hono } from 'hono';
import { isIsoDate, todayIn } from '@school/core';
import { badRequest } from '@school/server';
import type { ControlEnv, Deps } from '../context';

/** The audit trail across every school, newest first, with filters. */
export function eventsRoutes({ store, config }: Deps) {
  const r = new Hono<ControlEnv>();

  r.get('/', async (c) => {
    const q = c.req.query();
    const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));
    const offset = Math.max(0, Number(q.offset) || 0);
    for (const d of [q.from, q.to]) if (d && !isIsoDate(d)) throw badRequest('Use dates like 2026-11-24.');

    const [events, schools] = await Promise.all([store.all('events'), store.all('schools')]);
    const byId = new Map(schools.map((s) => [s.id, s]));
    const tz = config.displayTimezone;
    const search = (q.q ?? '').trim().toLowerCase();

    const filtered = events
      .filter((e) => !q.schoolId || e.schoolId === q.schoolId)
      .filter((e) => !q.kind || e.kind === q.kind)
      .filter((e) => !q.action || e.action === q.action)
      .filter((e) => {
        if (!q.from && !q.to) return true;
        const day = todayIn(tz, new Date(e.at));
        return (!q.from || day >= q.from) && (!q.to || day <= q.to);
      })
      .filter(
        (e) =>
          !search ||
          [e.action, e.entity, e.entityId, e.actorId, byId.get(e.schoolId)?.name ?? '', byId.get(e.schoolId)?.code ?? '']
            .join(' ')
            .toLowerCase()
            .includes(search)
      )
      .sort((a, b) => b.at.localeCompare(a.at));

    return c.json({
      total: filtered.length,
      actions: [...new Set(events.map((e) => e.action))].sort(),
      events: filtered.slice(offset, offset + limit).map((e) => ({
        ...e,
        schoolName: byId.get(e.schoolId)?.name ?? '(removed school)',
        schoolCode: byId.get(e.schoolId)?.code ?? '',
      })),
    });
  });

  return r;
}
