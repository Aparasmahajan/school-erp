import { Hono } from 'hono';
import { CAPABILITY_IDS, todayIn, type CapabilityId, type Reach } from '@school/core';
import { getSettings, guard, publicUser, type AppEnv, type Deps } from '../context';

/** Who am I, what may I do, and the school's settings — one request on app start. */
export function meRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const g = guard(c);
    const settings = await getSettings(store, config);
    // For showing/hiding menus only. The server re-checks every action against its target.
    const access: Partial<Record<CapabilityId, Reach[]>> = {};
    for (const cap of CAPABILITY_IDS) {
      const reaches = g.reaches(cap);
      if (reaches.length) access[cap] = reaches;
    }
    return c.json({
      user: publicUser(c.get('user')),
      roles: g.actor.roles,
      classTeacherOf: g.actor.classTeacherOf,
      access,
      school: settings,
      today: todayIn(settings.timezone),
      storage: store.kind,
    });
  });

  return r;
}
