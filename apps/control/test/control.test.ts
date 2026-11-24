import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore } from '@school/server';
import { createControlApp } from '../server/app';
import { ConfigError, loadConfig } from '../server/config';
import { CONTROL_TABLES, type ControlTables } from '../server/schema';
import { DEMO_INSTALL_KEY, DEMO_PASSWORD, DEMO_SCHOOL_ID, seedControlDemo } from '../server/seed';

const ENV = {
  NODE_ENV: 'test',
  CONTROL_SESSION_SECRET: 'control-test-secret-0123456789abcdef0123456789',
  STORAGE: 'memory',
  PUBLIC_URL: 'http://localhost:5174',
  HEARTBEAT_HISTORY_MINUTES: '0',
};

let app: ReturnType<typeof createControlApp>;
let store: MemoryStore<ControlTables>;
let owner: string;
let viewer: string;

async function call(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const heartbeat = (schoolId: string) => ({
  schoolId, at: new Date().toISOString(), appVersion: '0.1.0', schemaVersion: 1, storage: 'sheets', schoolName: 'X',
  timezone: 'Asia/Kolkata', students: 100, staff: 10, sections: 4, sectionsMarked: 2, presentPct: 95.5,
  staffCheckedIn: 8, errors: 0, queued: 0, dropped: 0, uptimeS: 60,
});

const event = (id: string, detail: Record<string, unknown> = {}) => ({
  id, at: new Date().toISOString(), kind: 'audit', action: 'student.update', entity: 'student', entityId: 'stu_1',
  actorId: 'usr_1', actorRoles: ['OFFICE_ADMIN'], detail,
});

beforeAll(async () => {
  const config = loadConfig(ENV);
  store = new MemoryStore(CONTROL_TABLES);
  await seedControlDemo(store);
  app = createControlApp({ store, config });
  const login = async (email: string) => (await call(null, 'POST', '/api/auth/login', { email, password: DEMO_PASSWORD })).body.token as string;
  owner = await login('owner@control.demo');
  viewer = await login('viewer@control.demo');
});

describe('console access', () => {
  it.each([
    ['GET', '/api/me'], ['GET', '/api/overview'], ['GET', '/api/schools'], ['POST', '/api/schools'], ['GET', '/api/schools/x'],
    ['PATCH', '/api/schools/x'], ['POST', '/api/schools/x/rotate-key'], ['GET', '/api/events'], ['GET', '/api/admins'],
    ['POST', '/api/admins'], ['GET', '/api/admins/activity'], ['GET', '/api/anything-added-later'],
  ])('%s %s needs a console session', async (method, path) => {
    expect((await call(null, method, path, method === 'GET' ? undefined : {})).status).toBe(401);
  });

  it('a viewer can look but not change anything', async () => {
    expect((await call(viewer, 'GET', '/api/overview')).status).toBe(200);
    expect((await call(viewer, 'POST', '/api/schools', { name: 'Nope', code: 'NOPE' })).status).toBe(403);
    expect((await call(viewer, 'GET', '/api/admins')).status).toBe(403);
  });

  it('there is always one active owner', async () => {
    expect((await call(owner, 'PATCH', '/api/admins/adm_demo_owner', { role: 'VIEWER' })).status).toBe(400);
  });
});

describe('onboarding and install keys', () => {
  let schoolId = '';
  let key = '';

  it('creates a school and shows its install key exactly once', async () => {
    const res = await call(owner, 'POST', '/api/schools', { name: 'Test Valley School', code: 'tvs-01', city: 'Bhopal' });
    expect(res.status).toBe(201);
    expect(res.body.installKey).toMatch(/^ik_/);
    expect(res.body.env).toContain(`CONTROL_SCHOOL_ID=${res.body.school.id}`);
    expect(res.body.school.code).toBe('TVS-01');
    expect(res.body.school.status).toBe('ONBOARDING');
    schoolId = res.body.school.id;
    key = res.body.installKey;
    const list = await call(owner, 'GET', '/api/schools');
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(JSON.stringify(list.body)).not.toContain('keyHash');
  });

  it('refuses reports with a wrong key or another school’s key', async () => {
    expect((await call('ik_wrong', 'POST', '/api/ingest/heartbeat', heartbeat(schoolId))).status).toBe(401);
    expect((await call(DEMO_INSTALL_KEY, 'POST', '/api/ingest/heartbeat', heartbeat(schoolId))).status).toBe(401);
  });

  it('accepts a heartbeat with the right key and marks the school live', async () => {
    expect((await call(key, 'POST', '/api/ingest/heartbeat', heartbeat(schoolId))).status).toBe(200);
    const detail = await call(owner, 'GET', `/api/schools/${schoolId}`);
    expect(detail.body.school.status).toBe('LIVE');
    expect(detail.body.school.health).toBe('live');
    expect(detail.body.school.snapshot.students).toBe(100);
    expect(detail.body.heartbeats.length).toBe(1);
  });

  it('rejects unexpected fields in a report', async () => {
    expect((await call(key, 'POST', '/api/ingest/heartbeat', { ...heartbeat(schoolId), studentNames: ['x'] })).status).toBe(400);
  });

  it('strips personal data a school should never have sent', async () => {
    const res = await call(key, 'POST', '/api/ingest/events', {
      schoolId,
      events: [event('aud_leak', { before: { firstName: 'Secret', phone: '+91 98765 43210' }, after: { lastName: 'Kumar', lat: 26.9, sectionId: 'sec_1', status: 'ACTIVE' } })],
    });
    expect(res.status).toBe(200);
    const stored = (await store.all('events')).find((e) => e.id === 'aud_leak');
    expect(stored?.detail).toEqual({ after: { sectionId: 'sec_1', status: 'ACTIVE' } });
  });

  it('stores a retried batch only once', async () => {
    const batch = { schoolId, events: [event('aud_dup_1'), event('aud_dup_2')] };
    expect((await call(key, 'POST', '/api/ingest/events', batch)).body).toEqual({ accepted: 2, duplicates: 0 });
    expect((await call(key, 'POST', '/api/ingest/events', batch)).body).toEqual({ accepted: 0, duplicates: 2 });
  });

  it('rotating the key stops the old one at once', async () => {
    const res = await call(owner, 'POST', `/api/schools/${schoolId}/rotate-key`, {});
    expect(res.status).toBe(200);
    expect((await call(key, 'POST', '/api/ingest/heartbeat', heartbeat(schoolId))).status).toBe(401);
    expect((await call(res.body.installKey, 'POST', '/api/ingest/heartbeat', heartbeat(schoolId))).status).toBe(200);
    key = res.body.installKey;
  });

  it('an offboarded school can no longer report', async () => {
    expect((await call(owner, 'PATCH', `/api/schools/${schoolId}`, { status: 'OFFBOARDED' })).status).toBe(200);
    expect((await call(key, 'POST', '/api/ingest/heartbeat', heartbeat(schoolId))).status).toBe(403);
  });

  it('every console change is in the console log', async () => {
    const log = await call(owner, 'GET', '/api/admins/activity');
    const actions = log.body.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['school.onboard', 'school.went_live', 'school.rotate_key', 'school.offboarded']));
  });
});

describe('overview and trail', () => {
  it('shows every state of health in the demo network', async () => {
    const res = await call(viewer, 'GET', '/api/overview');
    const health = Object.fromEntries(res.body.schools.map((s: { code: string; health: string }) => [s.code, s.health]));
    expect(health).toMatchObject({ 'SUNRISE-JPR': 'live', 'STANNE-KOC': 'stale', 'VIDYA-LKO': 'offline', 'BANYAN-PNQ': 'never', 'RIVERSIDE-GAU': 'paused' });
    const vidya = res.body.schools.find((s: { code: string }) => s.code === 'VIDYA-LKO');
    expect(vidya.issues.join(' ')).toMatch(/0\.0\.9/);
    expect(res.body.days).toHaveLength(14);
  });

  it('filters the trail by school and action', async () => {
    const res = await call(viewer, 'GET', `/api/events?schoolId=${DEMO_SCHOOL_ID}&action=attendance.mark&limit=5`);
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
    expect(res.body.events.every((e: { schoolId: string; action: string }) => e.schoolId === DEMO_SCHOOL_ID && e.action === 'attendance.mark')).toBe(true);
  });
});

describe('config', () => {
  it('refuses to start without a secret or with demo data in production', () => {
    const { CONTROL_SESSION_SECRET: _s, ...rest } = ENV;
    expect(() => loadConfig(rest)).toThrow(ConfigError);
    expect(() => loadConfig({ ...ENV, NODE_ENV: 'production', DEMO_SEED: 'true' })).toThrow(/production/);
  });
});
