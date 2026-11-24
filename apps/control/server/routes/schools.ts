import { Hono } from 'hono';
import { newId } from '@school/core';
import { HttpError, conflict, notFound, readBody } from '@school/server';
import { consoleAudit, publicSchool, requireOwner, type ControlEnv, type Deps } from '../context';
import { healthOf, latestVersion } from '../health';
import { createSchoolInput, updateSchoolInput } from '../inputs';
import { envSnippet, hashKey, newInstallKey } from '../keys';
import type { SchoolRecord } from '../schema';

export function schoolsRoutes({ store, config }: Deps) {
  const r = new Hono<ControlEnv>();
  const withHealth = (s: SchoolRecord, latest: string) => ({ ...publicSchool(s), ...healthOf(s, config, latest) });

  r.get('/', async (c) => {
    const schools = await store.all('schools');
    const latest = latestVersion(schools);
    return c.json({
      latestVersion: latest,
      schools: schools.map((s) => withHealth(s, latest)).sort((a, b) => a.name.localeCompare(b.name)),
    });
  });

  r.get('/:id', async (c) => {
    const [schools, heartbeats, events] = await Promise.all([store.all('schools'), store.all('heartbeats'), store.all('events')]);
    const school = schools.find((s) => s.id === c.req.param('id'));
    if (!school) throw notFound('No such school.');
    return c.json({
      school: withHealth(school, latestVersion(schools)),
      heartbeats: heartbeats
        .filter((h) => h.schoolId === school.id)
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-72),
      events: events
        .filter((e) => e.schoolId === school.id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 50),
    });
  });

  /** Onboard a school. The install key is returned ONCE and only its hash is stored. */
  r.post('/', async (c) => {
    const admin = requireOwner(c);
    const body = await readBody(c, createSchoolInput);
    const key = newInstallKey();
    const school = await store.exclusive(async () => {
      const schools = await store.all('schools');
      if (schools.some((s) => s.code === body.code)) throw conflict(`Another school already uses the code ${body.code}.`);
      const now = new Date().toISOString();
      const row: SchoolRecord = {
        id: newId('sch'),
        ...body,
        status: 'ONBOARDING',
        keyHash: hashKey(key),
        keyPrefix: key.slice(0, 10),
        keyRotatedAt: now,
        onboardedAt: '',
        createdAt: now,
        createdBy: admin.id,
        lastSeenAt: '',
        appVersion: '',
        schemaVersion: null,
        snapshot: null,
      };
      await store.insert('schools', [row]);
      return row;
    });
    await consoleAudit(store, { adminId: admin.id, action: 'school.onboard', entity: 'school', entityId: school.id, before: null, after: publicSchool(school) });
    return c.json({ school: publicSchool(school), installKey: key, env: envSnippet(config.publicUrl, school.id, key) }, 201);
  });

  r.patch('/:id', async (c) => {
    const admin = requireOwner(c);
    const body = await readBody(c, updateSchoolInput);
    const { before, after } = await store.exclusive(async () => {
      const current = (await store.all('schools')).find((s) => s.id === c.req.param('id'));
      if (!current) throw notFound('No such school.');
      if (current.status === 'OFFBOARDED' && body.status && body.status !== 'OFFBOARDED') {
        throw new HttpError(409, 'An offboarded school needs a new key before it can report again. Rotate its key first.');
      }
      const updated = await store.update('schools', current.id, body);
      return { before: publicSchool(current), after: publicSchool(updated!) };
    });
    await consoleAudit(store, { adminId: admin.id, action: body.status && body.status !== before.status ? `school.${body.status.toLowerCase()}` : 'school.update', entity: 'school', entityId: after.id, before, after });
    return c.json({ school: after });
  });

  /** Issue a new key; the old one stops working at once. */
  r.post('/:id/rotate-key', async (c) => {
    const admin = requireOwner(c);
    const key = newInstallKey();
    const school = await store.exclusive(async () => {
      const current = (await store.all('schools')).find((s) => s.id === c.req.param('id'));
      if (!current) throw notFound('No such school.');
      return (await store.update('schools', current.id, {
        keyHash: hashKey(key),
        keyPrefix: key.slice(0, 10),
        keyRotatedAt: new Date().toISOString(),
        ...(current.status === 'OFFBOARDED' ? { status: 'ONBOARDING' as const } : {}),
      }))!;
    });
    await consoleAudit(store, { adminId: admin.id, action: 'school.rotate_key', entity: 'school', entityId: school.id, before: null, after: { keyPrefix: school.keyPrefix } });
    return c.json({ installKey: key, env: envSnippet(config.publicUrl, school.id, key) });
  });

  return r;
}
