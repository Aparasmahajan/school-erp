import { Hono } from 'hono';
import { newId, updateZoneInput, zoneInput, type GeofenceRow } from '@school/core';
import { SCHOOL, audit, getSettings, guard, type AppEnv, type Deps } from '../context';
import { forbidden, notFound } from '../lib/errors';
import { readBody } from '../lib/http';

/**
 * Attendance zones: circles (centre + radius) staff must be inside to check in or out.
 * Everyone who checks in may read the active zones (their phone needs them to unlock the
 * button); only geofences.manage may change them.
 */
export function zonesRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const g = guard(c);
    const manage = g.can('geofences.manage', SCHOOL);
    if (!manage && !g.has('staff_attendance.mark') && !g.has('staff_attendance.view')) {
      throw forbidden("You can't see attendance zones.");
    }
    const [zones, settings] = await Promise.all([store.all('geofences'), getSettings(store, config)]);
    return c.json({
      zones: zones.filter((z) => manage || z.active),
      maxAccuracyM: settings.geoMaxAccuracyM,
      canManage: manage,
    });
  });

  r.post('/', async (c) => {
    const g = guard(c);
    g.require('geofences.manage', SCHOOL, "You can't set attendance zones.");
    const body = await readBody(c, zoneInput);
    const row: GeofenceRow = {
      id: newId('zon'),
      ...body,
      updatedBy: g.actor.userId,
      updatedAt: new Date().toISOString(),
    };
    await store.insert('geofences', [row]);
    await audit(store, { actorId: g.actor.userId, action: 'zone.create', entity: 'geofence', entityId: row.id, before: null, after: row });
    return c.json({ zone: row }, 201);
  });

  r.patch('/:id', async (c) => {
    const g = guard(c);
    g.require('geofences.manage', SCHOOL, "You can't set attendance zones.");
    const body = await readBody(c, updateZoneInput);
    const id = c.req.param('id');
    const { before, after } = await store.exclusive(async () => {
      const current = (await store.all('geofences')).find((z) => z.id === id);
      if (!current) throw notFound('No such zone.');
      const updated = await store.update('geofences', id, { ...body, updatedBy: g.actor.userId, updatedAt: new Date().toISOString() });
      return { before: current, after: updated! };
    });
    await audit(store, { actorId: g.actor.userId, action: 'zone.update', entity: 'geofence', entityId: id, before, after });
    return c.json({ zone: after });
  });

  r.delete('/:id', async (c) => {
    const g = guard(c);
    g.require('geofences.manage', SCHOOL, "You can't set attendance zones.");
    const id = c.req.param('id');
    const current = (await store.all('geofences')).find((z) => z.id === id);
    if (!current || !(await store.remove('geofences', id))) throw notFound('No such zone.');
    await audit(store, { actorId: g.actor.userId, action: 'zone.delete', entity: 'geofence', entityId: id, before: current, after: null });
    return c.json({ ok: true });
  });

  return r;
}
