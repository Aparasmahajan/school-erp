import { beforeAll, describe, expect, it } from 'vitest';
import { todayIn, addDays } from '@school/core';
import { setup } from './helpers';

/**
 * Each test here pins down one of the problems found in the previous ERP, so they can't
 * come back unnoticed. See docs/CONTEXT.md, "Problems found in the old ERP".
 */

let t: Awaited<ReturnType<typeof setup>>;
let principal: string;
let teacher: string;
let office: string;
const today = todayIn('Asia/Kolkata');

beforeAll(async () => {
  t = await setup();
  [principal, teacher, office] = await Promise.all([
    t.login('principal@demo.school'),
    t.login('teacher@demo.school'),
    t.login('office@demo.school'),
  ]);
});

async function allPresent(token: string, sectionId: string, date = today) {
  const res = await t.call(token, 'GET', `/api/attendance?sectionId=${sectionId}&date=${date}`);
  return Object.fromEntries(res.body.roster.map((s: { id: string }) => [s.id, 'P']));
}

describe('old ERP #4: routes without a login check', () => {
  const routes: [string, string][] = [
    ['GET', '/api/me'], ['GET', '/api/dashboard'], ['GET', '/api/students'], ['GET', '/api/students/x'],
    ['POST', '/api/students'], ['PATCH', '/api/students/x'], ['GET', '/api/attendance?sectionId=x'],
    ['PUT', '/api/attendance'], ['GET', '/api/attendance/summary'], ['GET', '/api/classes'], ['POST', '/api/classes'],
    ['GET', '/api/staff'], ['POST', '/api/staff'], ['PATCH', '/api/staff/x'], ['GET', '/api/roles'], ['PUT', '/api/roles'],
    ['GET', '/api/zones'], ['POST', '/api/zones'], ['GET', '/api/staff-attendance'], ['GET', '/api/staff-attendance/me'],
    ['POST', '/api/staff-attendance/check'], ['GET', '/api/settings'], ['PUT', '/api/settings'],
    ['GET', '/api/some-route-added-later'],
  ];
  it.each(routes)('%s %s needs a session', async (method, path) => {
    const res = await t.call(null, method, path, method === 'GET' ? undefined : {});
    expect(res.status).toBe(401);
  });

  it('a forged or expired-looking token is refused', async () => {
    const res = await t.call('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad', 'GET', '/api/me');
    expect(res.status).toBe(401);
  });
});

describe('login', () => {
  it('ignores email case and gives one message for unknown email and wrong password', async () => {
    expect((await t.call(null, 'POST', '/api/auth/login', { email: 'PRINCIPAL@Demo.School', password: 'Demo@12345' })).status).toBe(200);
    const wrong = await t.call(null, 'POST', '/api/auth/login', { email: 'principal@demo.school', password: 'nope' });
    const unknown = await t.call(null, 'POST', '/api/auth/login', { email: 'nobody@demo.school', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });
});

describe('old ERP #1: acting as someone else via the request body', () => {
  it('rejects an actorId or markedBy field outright', async () => {
    const sec = await t.sectionId(teacher, '7-B');
    const marks = await allPresent(teacher, sec);
    const res = await t.call(teacher, 'PUT', '/api/attendance', { sectionId: sec, date: today, marks, actorId: 'usr_principal' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unexpected field/);
  });

  it('records the signed-in person as the marker', async () => {
    const sec = await t.sectionId(teacher, '7-B');
    const marks = await allPresent(teacher, sec);
    expect((await t.call(teacher, 'PUT', '/api/attendance', { sectionId: sec, date: today, marks })).status).toBe(200);
    const view = await t.call(principal, 'GET', `/api/attendance?sectionId=${sec}&date=${today}`);
    expect(view.body.record.markedBy).toBe('Meera Iyer');
  });
});

describe('old ERP #2: reach is checked against the record', () => {
  it("a teacher's student list holds only their class and the sections they teach", async () => {
    // Meera is class teacher of 7-B and teaches Science in 8-A and 8-C.
    const res = await t.call(teacher, 'GET', '/api/students');
    expect(res.status).toBe(200);
    expect(res.body.students.length).toBe(36);
    expect(new Set(res.body.students.map((s: { sectionLabel: string }) => s.sectionLabel))).toEqual(new Set(['7-B', '8-A', '8-C']));
  });

  it('teaching a section lets you see its students but not edit them', async () => {
    const res = await t.call(teacher, 'GET', '/api/students');
    const in8A = res.body.students.find((s: { sectionLabel: string }) => s.sectionLabel === '8-A');
    const in7B = res.body.students.find((s: { sectionLabel: string }) => s.sectionLabel === '7-B');
    expect((await t.call(teacher, 'GET', `/api/students/${in8A.id}`)).body.student.canEdit).toBe(false);
    expect((await t.call(teacher, 'PATCH', `/api/students/${in8A.id}`, { lastName: 'Changed' })).status).toBe(403);
    expect((await t.call(teacher, 'PATCH', `/api/students/${in7B.id}`, { lastName: in7B.name.split(' ').pop() })).status).toBe(200);
  });

  it("another class's student is a 404 for them, not a 403", async () => {
    const all = await t.call(principal, 'GET', '/api/students?q=');
    const other = all.body.students.find((s: { sectionLabel: string }) => s.sectionLabel === '9-C');
    expect((await t.call(teacher, 'GET', `/api/students/${other.id}`)).status).toBe(404);
    expect((await t.call(principal, 'GET', `/api/students/${other.id}`)).status).toBe(200);
  });

  it('a class teacher cannot mark another section', async () => {
    const other = await t.sectionId(principal, '9-C');
    const marks = await allPresent(principal, other);
    expect((await t.call(teacher, 'PUT', '/api/attendance', { sectionId: other, date: today, marks })).status).toBe(403);
  });
});

describe('old ERP #3: lists over-share personal data', () => {
  it('masks guardian phone numbers in the student list', async () => {
    const res = await t.call(principal, 'GET', '/api/students');
    for (const s of res.body.students) expect(s.guardianPhone).toMatch(/^••••••\d{3}$/);
  });
});

describe('attendance rules', () => {
  it('refuses future dates', async () => {
    const sec = await t.sectionId(teacher, '7-B');
    const marks = await allPresent(teacher, sec);
    const res = await t.call(teacher, 'PUT', '/api/attendance', { sectionId: sec, date: addDays(today, 1), marks });
    expect(res.status).toBe(400);
  });

  it('changing a past day needs the amend permission', async () => {
    const sec = await t.sectionId(principal, '7-B');
    const yesterday = addDays(today, -1);
    const marks = await allPresent(principal, sec, yesterday);
    // Office admins may mark today but not rewrite history.
    expect((await t.call(office, 'PUT', '/api/attendance', { sectionId: sec, date: yesterday, marks })).status).toBe(403);
    expect((await t.call(teacher, 'PUT', '/api/attendance', { sectionId: sec, date: yesterday, marks })).status).toBe(200);
  });

  it('needs a status for every student', async () => {
    const sec = await t.sectionId(teacher, '7-B');
    const marks = await allPresent(teacher, sec);
    delete marks[Object.keys(marks)[0]];
    const res = await t.call(teacher, 'PUT', '/api/attendance', { sectionId: sec, date: today, marks });
    expect(res.status).toBe(400);
    expect(res.body.missing).toHaveLength(1);
  });

  it('old ERP #6: two saves at once still make one record', async () => {
    const sec = await t.sectionId(principal, '9-C');
    const marks = await allPresent(principal, sec);
    const [a, b] = await Promise.all([
      t.call(principal, 'PUT', '/api/attendance', { sectionId: sec, date: today, marks }),
      t.call(principal, 'PUT', '/api/attendance', { sectionId: sec, date: today, marks }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const rows = (await t.store.all('attendance')).filter((r) => r.sectionId === sec && r.date === today);
    expect(rows).toHaveLength(1);
  });
});

describe('accounts and roles', () => {
  it('suspending someone ends their session immediately', async () => {
    const arun = await t.login('arun@demo.school');
    expect((await t.call(arun, 'GET', '/api/me')).status).toBe(200);
    const staff = await t.call(principal, 'GET', '/api/staff');
    const arunId = staff.body.staff.find((s: { email: string }) => s.email === 'arun@demo.school').id;
    expect((await t.call(principal, 'PATCH', `/api/staff/${arunId}`, { status: 'SUSPENDED' })).status).toBe(200);
    expect((await t.call(arun, 'GET', '/api/me')).status).toBe(401);
  });

  it('an office admin cannot change the principal’s account', async () => {
    const staff = await t.call(office, 'GET', '/api/staff');
    const anita = staff.body.staff.find((s: { email: string }) => s.email === 'principal@demo.school');
    expect((await t.call(office, 'PATCH', `/api/staff/${anita.id}`, { status: 'SUSPENDED' })).status).toBe(403);
  });

  it('the roles matrix cannot remove the principal’s own access to it', async () => {
    const res = await t.call(principal, 'PUT', '/api/roles', { grants: [{ role: 'PRINCIPAL', capability: 'students.view', reach: 'SCHOOL' }] });
    expect(res.status).toBe(400);
  });

  it('a reach a capability does not support is refused', async () => {
    const current = await t.call(principal, 'GET', '/api/roles');
    const grants = [...current.body.grants, { role: 'CLASS_TEACHER', capability: 'geofences.manage', reach: 'OWN_CLASS' }];
    expect((await t.call(principal, 'PUT', '/api/roles', { grants })).status).toBe(400);
  });

  it('invites can be used once', async () => {
    const created = await t.call(principal, 'POST', '/api/staff', { name: 'New Teacher', email: 'new@demo.school', roles: ['SUBJECT_TEACHER'] });
    expect(created.status).toBe(201);
    const token = new URL(created.body.inviteUrl).searchParams.get('token');
    expect((await t.call(null, 'POST', '/api/auth/accept-invite', { token, password: 'a-good-password' })).status).toBe(200);
    expect((await t.call(null, 'POST', '/api/auth/accept-invite', { token, password: 'another-password' })).status).toBe(410);
  });
});

describe('cookie sessions and cross-site requests', () => {
  async function cookie() {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'principal@demo.school', password: 'Demo@12345' }),
    });
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    return set.split(';')[0];
  }

  it('blocks writes from another website', async () => {
    const c = await cookie();
    const res = await t.call(null, 'PUT', '/api/settings', { schoolName: 'Hacked' }, { cookie: c, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('blocks form-style (non-JSON) writes', async () => {
    const c = await cookie();
    const res = await t.app.request('/api/settings', { method: 'PUT', headers: { cookie: c, 'content-type': 'text/plain' }, body: 'x' });
    expect(res.status).toBe(415);
  });

  it('allows writes from our own pages', async () => {
    const c = await cookie();
    const res = await t.call(null, 'PUT', '/api/settings', { staffStartTime: '08:15' }, { cookie: c, origin: 'http://localhost:5173' });
    expect(res.status).toBe(200);
  });
});
