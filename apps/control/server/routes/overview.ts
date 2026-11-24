import { Hono } from 'hono';
import { addDays, todayIn } from '@school/core';
import type { ControlEnv, Deps } from '../context';
import { healthOf, latestVersion, type Health } from '../health';

/** The whole network at a glance: health per school, totals, and 14 days of activity. */
export function overviewRoutes({ store, config }: Deps) {
  const r = new Hono<ControlEnv>();

  r.get('/', async (c) => {
    const [schools, events] = await Promise.all([store.all('schools'), store.all('events')]);
    const now = Date.now();
    const tz = config.displayTimezone;
    const today = todayIn(tz);
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
    const latest = latestVersion(schools);
    const dayAgo = now - 24 * 3600_000;

    // events per school per day, and in the last 24 h
    const perDay = new Map<string, Map<string, number>>();
    const last24 = new Map<string, { events: number; errors: number }>();
    for (const e of events) {
      const t = Date.parse(e.at);
      const day = todayIn(tz, new Date(t));
      const m = perDay.get(e.schoolId) ?? new Map<string, number>();
      m.set(day, (m.get(day) ?? 0) + 1);
      perDay.set(e.schoolId, m);
      if (t >= dayAgo) {
        const x = last24.get(e.schoolId) ?? { events: 0, errors: 0 };
        x.events += 1;
        if (e.kind === 'error') x.errors += 1;
        last24.set(e.schoolId, x);
      }
    }

    const rows = schools
      .filter((s) => s.status !== 'OFFBOARDED')
      .map((s) => {
        const { health, issues } = healthOf(s, config, latest, now);
        const snap = s.snapshot ?? {};
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          city: s.city,
          board: s.board,
          status: s.status,
          health,
          issues,
          lastSeenAt: s.lastSeenAt,
          appVersion: s.appVersion,
          students: snap.students ?? null,
          staff: snap.staff ?? null,
          sections: snap.sections ?? null,
          sectionsMarked: snap.sectionsMarked ?? null,
          presentPct: snap.presentPct ?? null,
          staffCheckedIn: snap.staffCheckedIn ?? null,
          events24h: last24.get(s.id)?.events ?? 0,
          errors24h: last24.get(s.id)?.errors ?? 0,
          activity: days.map((d) => perDay.get(s.id)?.get(d) ?? 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const count = (h: Health) => rows.filter((x) => x.health === h).length;
    return c.json({
      now: new Date(now).toISOString(),
      today,
      days,
      latestVersion: latest,
      schools: rows,
      totals: {
        schools: rows.length,
        live: count('live'),
        stale: count('stale'),
        offline: count('offline'),
        never: count('never'),
        paused: count('paused'),
        students: rows.reduce((n, x) => n + (x.students ?? 0), 0),
        staff: rows.reduce((n, x) => n + (x.staff ?? 0), 0),
        events24h: rows.reduce((n, x) => n + x.events24h, 0),
        errors24h: rows.reduce((n, x) => n + x.errors24h, 0),
      },
    });
  });

  return r;
}
