import { z } from 'zod';
import { isValidTimeZone } from '@school/core';

const PLACEHOLDER = /change.?me|replace|your[-_ ]|example|placeholder/i;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8788),
  CONTROL_SESSION_SECRET: z
    .string({ error: 'CONTROL_SESSION_SECRET is not set. Run `npm run setup:env` from the repo root.' })
    .min(32, 'CONTROL_SESSION_SECRET must be at least 32 characters.')
    .refine((s) => !PLACEHOLDER.test(s), 'CONTROL_SESSION_SECRET still looks like a placeholder.'),
  STORAGE: z.enum(['sheets', 'file', 'memory']).default('file'),
  DATA_FILE: z.string().default('.data/control.json'),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  SHEETS_CACHE_SECONDS: z.coerce.number().min(0).max(3600).default(30),
  PUBLIC_URL: z.url().default('http://localhost:5174'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  WEB_DIST: z.string().optional(),
  DISPLAY_TIMEZONE: z.string().default('Asia/Kolkata'),
  STALE_AFTER_MINUTES: z.coerce.number().int().min(1).default(20),
  OFFLINE_AFTER_MINUTES: z.coerce.number().int().min(2).default(120),
  HEARTBEAT_HISTORY_MINUTES: z.coerce.number().int().min(0).default(60),
  DEMO_SEED: z.enum(['true', 'false']).default('false'),
});

export interface ControlConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  sessionSecret: string;
  storage: 'sheets' | 'file' | 'memory';
  dataFile: string;
  sheets?: { spreadsheetId: string; clientEmail: string; privateKey: string; cacheSeconds: number };
  publicUrl: string;
  cookieSecure: boolean;
  webDist?: string;
  displayTimezone: string;
  staleAfterMs: number;
  offlineAfterMs: number;
  historyEveryMs: number;
  demoSeed: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ControlConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError('The Control console cannot start:\n' + parsed.error.issues.map((i) => `  - ${i.message}`).join('\n'));
  }
  const e = parsed.data;

  let sheets: ControlConfig['sheets'];
  if (e.STORAGE === 'sheets') {
    const missing = (['GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'] as const).filter((k) => !e[k]);
    if (missing.length) throw new ConfigError(`STORAGE=sheets needs ${missing.join(', ')}.`);
    sheets = {
      spreadsheetId: e.GOOGLE_SHEETS_SPREADSHEET_ID!,
      clientEmail: e.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      privateKey: e.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!,
      cacheSeconds: e.SHEETS_CACHE_SECONDS,
    };
  }
  const demoSeed = e.DEMO_SEED === 'true';
  if (demoSeed && e.NODE_ENV === 'production') throw new ConfigError('DEMO_SEED cannot be on in production.');
  if (!isValidTimeZone(e.DISPLAY_TIMEZONE)) throw new ConfigError(`DISPLAY_TIMEZONE "${e.DISPLAY_TIMEZONE}" is not a time zone.`);
  if (e.OFFLINE_AFTER_MINUTES <= e.STALE_AFTER_MINUTES) throw new ConfigError('OFFLINE_AFTER_MINUTES must be longer than STALE_AFTER_MINUTES.');

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    sessionSecret: e.CONTROL_SESSION_SECRET,
    storage: e.STORAGE,
    dataFile: e.DATA_FILE,
    sheets,
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ''),
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
    webDist: e.WEB_DIST,
    displayTimezone: e.DISPLAY_TIMEZONE,
    staleAfterMs: e.STALE_AFTER_MINUTES * 60_000,
    offlineAfterMs: e.OFFLINE_AFTER_MINUTES * 60_000,
    historyEveryMs: e.HEARTBEAT_HISTORY_MINUTES * 60_000,
    demoSeed,
  };
}
