import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in a real browser, against production-style servers:
 *   school API on :8797 serving the built school web app, reporting to
 *   the Control console on :8798 serving the built console web app.
 * Both use in-memory storage with their demo data, so every run starts clean.
 *
 * Run: npm run e2e   (builds both web apps first)
 */
export const SCHOOL = 'http://localhost:8797';
export const CONSOLE = 'http://localhost:8798';
const outbox = path.join(mkdtempSync(path.join(tmpdir(), 'erp-e2e-')), 'outbox.json');

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx server/main.ts',
      cwd: 'apps/control',
      url: `${CONSOLE}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: '8798',
        STORAGE: 'memory',
        DEMO_SEED: 'true',
        WEB_DIST: 'web/dist',
        PUBLIC_URL: CONSOLE,
        CONTROL_SESSION_SECRET: 'e2e-console-secret-0123456789abcdef0123456789',
      },
    },
    {
      command: 'npx tsx src/server.ts',
      cwd: 'apps/api',
      url: `${SCHOOL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: '8797',
        STORAGE: 'memory',
        DEMO_SEED: 'true',
        WEB_DIST: '../web/dist',
        PUBLIC_URL: SCHOOL,
        SESSION_SECRET: 'e2e-school-secret-0123456789abcdef0123456789',
        CONTROL_URL: CONSOLE,
        CONTROL_SCHOOL_ID: 'sch_demo_sunrise',
        CONTROL_INSTALL_KEY: 'ik_demo_local_only_never_use_in_production',
        TELEMETRY_HEARTBEAT_SECONDS: '30',
        TELEMETRY_FLUSH_SECONDS: '1',
        TELEMETRY_OUTBOX: outbox,
      },
    },
  ],
});
