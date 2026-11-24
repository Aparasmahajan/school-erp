import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_ZONE } from '../src/seed/demo';
import { setup } from './helpers';

let t: Awaited<ReturnType<typeof setup>>;
let principal: string;
let teacher: string;

const inside = { lat: DEMO_ZONE.lat + 0.0005, lng: DEMO_ZONE.lng, accuracyM: 15 }; // ~56 m from centre
const outside = { lat: DEMO_ZONE.lat + 0.01, lng: DEMO_ZONE.lng, accuracyM: 15 }; // ~1.1 km away

beforeAll(async () => {
  t = await setup();
  [principal, teacher] = await Promise.all([t.login('principal@demo.school'), t.login('teacher@demo.school')]);
});

describe('geofenced staff check-in', () => {
  it('refuses a check-in from outside the zone and says how far out', async () => {
    const res = await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'in', ...outside });
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('OUTSIDE');
    expect(res.body.outsideByM).toBeGreaterThan(800);
  });

  it('refuses an imprecise reading', async () => {
    const res = await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'in', ...inside, accuracyM: 900 });
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('INACCURATE');
  });

  it('cannot check out before checking in', async () => {
    const res = await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'out', ...inside });
    expect(res.status).toBe(409);
  });

  it('cannot check in on behalf of someone else', async () => {
    const res = await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'in', ...inside, userId: 'usr_someone' });
    expect(res.status).toBe(400);
  });

  it('accepts a check-in inside the zone, once', async () => {
    const res = await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'in', ...inside });
    expect(res.status).toBe(200);
    expect(res.body.zone).toBe('Main campus');
    expect(res.body.distanceM).toBeGreaterThan(40);
    expect(res.body.distanceM).toBeLessThan(70);
    expect((await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'in', ...inside })).status).toBe(409);
  });

  it('then accepts one check-out', async () => {
    expect((await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'out', ...inside })).status).toBe(200);
    expect((await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'out', ...inside })).status).toBe(409);
    const me = await t.call(teacher, 'GET', '/api/staff-attendance/me');
    expect(me.body.record.checkInTime).toMatch(/^\d{2}:\d{2}$/);
    expect(me.body.record.checkOutTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('a teacher sees only their own row; the principal sees everyone', async () => {
    const mine = await t.call(teacher, 'GET', '/api/staff-attendance');
    expect(mine.body.staff).toHaveLength(1);
    const all = await t.call(principal, 'GET', '/api/staff-attendance');
    expect(all.body.staff.length).toBeGreaterThan(5);
    expect(all.body.totals.checkedIn).toBeGreaterThanOrEqual(3);
  });
});

describe('attendance zones', () => {
  it('only people who manage zones can change them', async () => {
    const zone = { name: 'Sports ground', lat: 26.92, lng: 75.79, radiusM: 150 };
    expect((await t.call(teacher, 'POST', '/api/zones', zone)).status).toBe(403);
    expect((await t.call(principal, 'POST', '/api/zones', zone)).status).toBe(201);
  });

  it('rejects silly radii', async () => {
    expect((await t.call(principal, 'POST', '/api/zones', { name: 'Tiny', lat: 26.9, lng: 75.7, radiusM: 5 })).status).toBe(400);
  });

  it('with no active zone, check-in explains what to do', async () => {
    const list = await t.call(principal, 'GET', '/api/zones');
    for (const z of list.body.zones) await t.call(principal, 'PATCH', `/api/zones/${z.id}`, { active: false });
    const res = await t.call(principal, 'POST', '/api/staff-attendance/check', { action: 'in', ...inside });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('NO_ZONES');
  });
});
