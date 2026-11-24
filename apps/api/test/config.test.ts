import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';
import { TEST_ENV } from './helpers';

describe('old ERP #5: no fallback secret', () => {
  it('refuses to start without SESSION_SECRET', () => {
    const { SESSION_SECRET: _omit, ...env } = TEST_ENV;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, SESSION_SECRET: '' })).toThrow(ConfigError);
  });

  it('refuses a short or placeholder secret', () => {
    expect(() => loadConfig({ ...TEST_ENV, SESSION_SECRET: 'short' })).toThrow(/32 characters/);
    expect(() => loadConfig({ ...TEST_ENV, SESSION_SECRET: 'change-me-in-production-please-0123456789' })).toThrow(/placeholder/);
  });

  it('refuses demo logins in production', () => {
    expect(() => loadConfig({ ...TEST_ENV, NODE_ENV: 'production', DEMO_SEED: 'true' })).toThrow(/production/);
  });

  it('needs Google credentials when storage is sheets', () => {
    expect(() => loadConfig({ ...TEST_ENV, STORAGE: 'sheets' })).toThrow(/GOOGLE_SHEETS_SPREADSHEET_ID/);
  });

  it('turns secure cookies on in production', () => {
    expect(loadConfig({ ...TEST_ENV, NODE_ENV: 'production' }).cookieSecure).toBe(true);
    expect(loadConfig(TEST_ENV).cookieSecure).toBe(false);
  });
});
