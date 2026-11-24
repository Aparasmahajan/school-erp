import { createServer, type IncomingMessage } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_ZONE } from '../src/seed/demo';
import { Telemetry } from '../src/telemetry/telemetry';
import { setup } from './helpers';

/**
 * The worker thread delivers to a stand-in Control console. What matters most: the right
 * school key is sent, and no personal data leaves the school.
 */

interface Received {
  url: string;
  auth: string;
  body: any;
}

const received: Received[] = [];
let server: ReturnType<typeof createServer>;
let port = 0;
let t: Awaited<ReturnType<typeof setup>>;
let telemetry: Telemetry;

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => resolve(JSON.parse(text || '{}')));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    received.push({ url: req.url ?? '', auth: req.headers.authorization ?? '', body: await readJson(req) });
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;

  t = await setup();
  telemetry = new Telemetry(t.store, t.config, {
    url: `http://127.0.0.1:${port}`,
    schoolId: 'sch_test',
    installKey: 'ik_test_key',
    heartbeatSeconds: 3600,
    flushSeconds: 3600,
    outboxPath: path.join(mkdtempSync(path.join(tmpdir(), 'erp-outbox-')), 'outbox.json'),
  });
  telemetry.start();

  // Generate some audit events containing personal data.
  const principal = await t.login('principal@demo.school');
  const teacher = await t.login('teacher@demo.school');
  const list = await t.call(teacher, 'GET', '/api/students');
  const kid = list.body.students.find((s: { sectionLabel: string }) => s.sectionLabel === '7-B');
  await t.call(teacher, 'PATCH', `/api/students/${kid.id}`, {
    lastName: 'Zebrafish',
    guardians: [{ name: 'Guardian Zebrafish', relation: 'Mother', phone: '+91 99887 76655', isPrimary: true }],
  });
  await t.call(teacher, 'POST', '/api/staff-attendance/check', { action: 'in', lat: DEMO_ZONE.lat + 0.0004, lng: DEMO_ZONE.lng, accuracyM: 12 });
  await t.call(principal, 'POST', '/api/staff', { name: 'Private Person', email: 'private.person@demo.school', phone: '+91 90000 11111', roles: ['SUBJECT_TEACHER'] });
  await new Promise((r) => setTimeout(r, 150));
  await telemetry.flush();
});

afterAll(async () => {
  await telemetry.stop();
  await new Promise((r) => server.close(r));
});

describe('telemetry worker', () => {
  it('sends a heartbeat with counts and no personal data', () => {
    const hb = received.find((r) => r.url === '/api/ingest/heartbeat');
    expect(hb).toBeDefined();
    expect(hb!.auth).toBe('Bearer ik_test_key');
    expect(hb!.body).toMatchObject({ schoolId: 'sch_test', students: 180, staff: 9, schemaVersion: 1 });
    expect(hb!.body.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('sends audit events with the school key', () => {
    const batches = received.filter((r) => r.url === '/api/ingest/events');
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((b) => b.auth === 'Bearer ik_test_key' && b.body.schoolId === 'sch_test')).toBe(true);
    const actions = batches.flatMap((b) => b.body.events.map((e: { action: string }) => e.action));
    expect(actions).toEqual(expect.arrayContaining(['student.update', 'staff.check_in', 'staff.invite']));
  });

  it('keeps names, phone numbers, emails and coordinates inside the school', () => {
    const sent = JSON.stringify(received.map((r) => r.body));
    for (const secret of ['Zebrafish', '99887', 'Private Person', 'private.person', '90000', String(DEMO_ZONE.lat + 0.0004)]) {
      expect(sent).not.toContain(secret);
    }
  });

  it('still says what happened: roles, distances, counts', () => {
    const events = received.filter((r) => r.url === '/api/ingest/events').flatMap((r) => r.body.events);
    const checkIn = events.find((e: { action: string }) => e.action === 'staff.check_in');
    expect(checkIn.actorRoles).toEqual(expect.arrayContaining(['CLASS_TEACHER']));
    expect(checkIn.detail.after.distanceM).toBeGreaterThan(0);
    const invite = events.find((e: { action: string }) => e.action === 'staff.invite');
    expect(invite.detail.after.roles).toEqual(['SUBJECT_TEACHER']);
  });
});
