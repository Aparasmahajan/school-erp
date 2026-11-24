import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { DEMO_PASSWORD, seedDemo } from '../src/seed/demo';
import { MemoryStore } from '../src/store/memory';

export const TEST_ENV = {
  NODE_ENV: 'test',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
  STORAGE: 'memory',
  PUBLIC_URL: 'http://localhost:5173',
};

/** A fresh demo school in memory, plus helpers that talk to it over HTTP. */
export async function setup() {
  const config = loadConfig(TEST_ENV);
  const store = new MemoryStore();
  await store.ensureSchema();
  await seedDemo(store);
  const app = createApp({ store, config });

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
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, body: json, headers: res.headers };
  }

  async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
    const res = await call(null, 'POST', '/api/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.token;
  }

  async function sectionId(token: string, label: string): Promise<string> {
    const res = await call(token, 'GET', '/api/classes');
    for (const cls of res.body.classes) for (const s of cls.sections) if (s.label === label) return s.id;
    throw new Error(`section ${label} not visible`);
  }

  return { app, store, config, call, login, sectionId };
}
