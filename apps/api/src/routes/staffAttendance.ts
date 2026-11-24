import { Hono } from 'hono';
import {
  STAFF_ROLE_KEYS,
  checkInput,
  checkZones,
  isIsoDate,
  newId,
  timeIn,
  todayIn,
  type GeofenceRow,
  type StaffAttendanceRow,
  type Zone,
} from '@school/core';
import { activeRolesOf, audit, getSettings, guard, type AppEnv, type Deps } from '../context';
import { HttpError, badRequest, forbidden } from '../lib/errors';
import { readBody } from '../lib/http';

/**
 * Geofenced staff check-in.
 *
 * The phone or laptop sends its location; the SERVER decides whether it is inside an
 * active zone, using the zone list and accuracy limit it holds. The browser's own check
 * only unlocks the button. Times are the server's clock, never the device's.
 *
 * Limits, stated plainly: a browser can be fed a fake location (developer tools, mock-GPS
 * apps). This stops casual "check in from home", records coordinates and accuracy for
 * review, and is not proof of presence. See docs/GEOFENCED_ATTENDANCE.md.
 */

const toZones = (rows: GeofenceRow[]): Zone[] =>
  rows
    .filter((z) => z.active && z.lat != null && z.lng != null && z.radiusM != null)
    .map((z) => ({ id: z.id, name: z.name, lat: z.lat!, lng: z.lng!, radiusM: z.radiusM! }));

export function staffAttendanceRoutes({ store, config }: Deps) {
  const r = new Hono<AppEnv>();

  r.get('/me', async (c) => {
    const g = guard(c);
    if (!g.has('staff_attendance.mark')) throw forbidden("Your role doesn't use staff check-in.");
    const [settings, records, zones] = await Promise.all([
      getSettings(store, config),
      store.all('staff_attendance'),
      store.all('geofences'),
    ]);
    const today = todayIn(settings.timezone);
    const record = records.find((x) => x.userId === g.actor.userId && x.date === today) ?? null;
    return c.json({
      today,
      record: record && present(record, zones, settings.timezone, settings.staffStartTime),
      zones: toZones(zones),
      maxAccuracyM: settings.geoMaxAccuracyM,
      staffStartTime: settings.staffStartTime,
    });
  });

  r.post('/check', async (c) => {
    const g = guard(c);
    g.require('staff_attendance.mark', { kind: 'user', userId: g.actor.userId }, "Your role doesn't use staff check-in.");
    const body = await readBody(c, checkInput);
    const [settings, zoneRows] = await Promise.all([getSettings(store, config), store.all('geofences')]);

    const result = checkZones({ lat: body.lat, lng: body.lng }, body.accuracyM, toZones(zoneRows), settings.geoMaxAccuracyM);
    if (!result.ok) {
      const details = { reason: result.reason, accuracyM: result.accuracyM, maxAccuracyM: result.maxAccuracyM, outsideByM: result.outsideByM, zone: result.nearest?.name };
      switch (result.reason) {
        case 'NO_ZONES':
          throw new HttpError(409, 'No attendance zone is set up yet. Ask the school office to add one.', details);
        case 'INACCURATE':
          throw new HttpError(422, `Your location is only accurate to ±${result.accuracyM} m; it needs to be ±${result.maxAccuracyM} m or better. Turn on precise location or step outside, then try again.`, details);
        case 'OUTSIDE':
          throw new HttpError(422, `You're about ${result.outsideByM} m outside ${result.nearest!.name}. Move inside the zone and try again.`, details);
        case 'BAD_POINT':
          throw badRequest('That location reading is not valid.');
      }
    }

    const now = new Date();
    const today = todayIn(settings.timezone, now);
    const fields = {
      at: now.toISOString(),
      lat: body.lat,
      lng: body.lng,
      accuracyM: Math.round(body.accuracyM),
      distanceM: result.distanceM,
      zoneId: result.zone.id,
    };

    const row = await store.exclusive(async () => {
      const existing = (await store.all('staff_attendance')).find((x) => x.userId === g.actor.userId && x.date === today);
      if (body.action === 'in') {
        if (existing?.checkInAt) {
          throw new HttpError(409, `You already checked in at ${timeIn(settings.timezone, new Date(existing.checkInAt))}.`);
        }
        const checkIn = {
          checkInAt: fields.at, checkInLat: fields.lat, checkInLng: fields.lng,
          checkInAccuracyM: fields.accuracyM, checkInDistanceM: fields.distanceM, checkInZoneId: fields.zoneId,
        };
        if (existing) return (await store.update('staff_attendance', existing.id, checkIn))!;
        const created: StaffAttendanceRow = {
          id: newId('sat'), userId: g.actor.userId, date: today, ...checkIn,
          checkOutAt: '', checkOutLat: null, checkOutLng: null, checkOutAccuracyM: null, checkOutDistanceM: null, checkOutZoneId: '',
        };
        await store.insert('staff_attendance', [created]);
        return created;
      }
      if (!existing?.checkInAt) throw new HttpError(409, 'Check in first.');
      if (existing.checkOutAt) {
        throw new HttpError(409, `You already checked out at ${timeIn(settings.timezone, new Date(existing.checkOutAt))}.`);
      }
      return (await store.update('staff_attendance', existing.id, {
        checkOutAt: fields.at, checkOutLat: fields.lat, checkOutLng: fields.lng,
        checkOutAccuracyM: fields.accuracyM, checkOutDistanceM: fields.distanceM, checkOutZoneId: fields.zoneId,
      }))!;
    });

    await audit(store, {
      actorId: g.actor.userId,
      action: body.action === 'in' ? 'staff.check_in' : 'staff.check_out',
      entity: 'staff_attendance',
      entityId: row.id,
      before: null,
      after: { zoneId: fields.zoneId, distanceM: fields.distanceM, accuracyM: fields.accuracyM },
    });
    return c.json({ record: present(row, zoneRows, settings.timezone, settings.staffStartTime), zone: result.zone.name, distanceM: result.distanceM });
  });

  /** A day's check-ins for the staff this person may see. */
  r.get('/', async (c) => {
    const g = guard(c);
    if (!g.has('staff_attendance.view')) throw forbidden("You can't see staff attendance.");
    const [settings, users, userRoles, records, zones] = await Promise.all([
      getSettings(store, config),
      store.all('users'),
      store.all('user_roles'),
      store.all('staff_attendance'),
      store.all('geofences'),
    ]);
    const date = c.req.query('date') || todayIn(settings.timezone);
    if (!isIsoDate(date)) throw badRequest('Use a date like 2026-11-24.');

    const rows = users
      .filter((u) => u.status === 'ACTIVE')
      .map((u) => ({ u, roles: activeRolesOf(userRoles, u.id) }))
      .filter(({ roles }) => roles.some((role) => STAFF_ROLE_KEYS.includes(role)))
      .filter(({ u }) => g.can('staff_attendance.view', { kind: 'user', userId: u.id }))
      .map(({ u, roles }) => {
        const rec = records.find((x) => x.userId === u.id && x.date === date);
        return { userId: u.id, name: u.name, roles, record: rec ? present(rec, zones, settings.timezone, settings.staffStartTime) : null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json({
      date,
      staffStartTime: settings.staffStartTime,
      staff: rows,
      totals: {
        staff: rows.length,
        checkedIn: rows.filter((x) => x.record?.checkInAt).length,
        late: rows.filter((x) => x.record?.late).length,
      },
    });
  });

  return r;
}

function present(row: StaffAttendanceRow, zones: GeofenceRow[], timeZone: string, startTime: string) {
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? '';
  const inTime = row.checkInAt ? timeIn(timeZone, new Date(row.checkInAt)) : '';
  return {
    date: row.date,
    checkInAt: row.checkInAt,
    checkInTime: inTime,
    checkInZone: zoneName(row.checkInZoneId),
    checkInDistanceM: row.checkInDistanceM,
    checkInAccuracyM: row.checkInAccuracyM,
    checkInLat: row.checkInLat,
    checkInLng: row.checkInLng,
    checkOutAt: row.checkOutAt,
    checkOutTime: row.checkOutAt ? timeIn(timeZone, new Date(row.checkOutAt)) : '',
    checkOutZone: zoneName(row.checkOutZoneId),
    checkOutDistanceM: row.checkOutDistanceM,
    checkOutAccuracyM: row.checkOutAccuracyM,
    late: !!inTime && inTime > startTime,
  };
}
