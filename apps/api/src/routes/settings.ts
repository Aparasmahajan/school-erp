import { Hono } from 'hono';
import { SETTING_KEYS, isValidTimeZone, settingsInput } from '@school/core';
import { SCHOOL, audit, getSettings, guard, type AppEnv, type Deps } from '../context';
import { badRequest } from '../lib/errors';
import { readBody } from '../lib/http';

export function settingsRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => c.json({ settings: await getSettings(store, config) }));

  r.put('/', async (c) => {
    const g = guard(c);
    g.require('settings.manage', SCHOOL, "You can't change school settings.");
    const body = await readBody(c, settingsInput);
    if (body.timezone && !isValidTimeZone(body.timezone)) throw badRequest(`"${body.timezone}" is not a time zone.`);

    const before = await getSettings(store, config);
    await store.exclusive(async () => {
      const rows = await store.all('settings');
      const now = new Date().toISOString();
      for (const key of SETTING_KEYS) {
        const value = body[key];
        if (value === undefined) continue;
        const patch = { value: String(value), updatedAt: now, updatedBy: g.actor.userId };
        if (rows.some((row) => row.id === key)) await store.update('settings', key, patch);
        else await store.insert('settings', [{ id: key, ...patch }]);
      }
    });
    const after = await getSettings(store, config);
    await audit(store, { actorId: g.actor.userId, action: 'settings.update', entity: 'settings', entityId: 'school', before, after });
    return c.json({ settings: after });
  });

  return r;
}
