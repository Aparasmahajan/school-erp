import { z } from 'zod';
import { isValidTimeZone } from '@school/core';

/**
 * Configuration is validated once at start-up and the process refuses to run when anything
 * important is missing. The old ERP fell back to a hard-coded JWT secret when
 * NEXTAUTH_SECRET was unset, which let anyone forge an admin login; there are no such
 * fallbacks here.
 */

const PLACEHOLDER = /change.?me|replace|your[-_ ]|example|placeholder/i;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  SESSION_SECRET: z
    .string({ error: 'SESSION_SECRET is not set. Run `npm run setup:env` from the repo root to create one.' })
    .min(32, 'SESSION_SECRET must be at least 32 characters. Run `npm run setup:env` to generate one.')
    .refine((s) => !PLACEHOLDER.test(s), 'SESSION_SECRET still looks like a placeholder. Generate a random one.'),
  STORAGE: z.enum(['sheets', 'file', 'memory']).default('file'),
  DATA_FILE: z.string().default('.data/school.json'),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  SHEETS_CACHE_SECONDS: z.coerce.number().min(0).max(3600).default(60),
  PUBLIC_URL: z.url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('tauri://localhost,http://tauri.localhost,https://tauri.localhost'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  WEB_DIST: z.string().optional(),
  DEMO_SEED: z.enum(['true', 'false']).default('false'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  // Reporting to the vendor's Control console (optional).
  CONTROL_URL: z.url().optional(),
  CONTROL_SCHOOL_ID: z.string().optional(),
  CONTROL_INSTALL_KEY: z.string().optional(),
  TELEMETRY_HEARTBEAT_SECONDS: z.coerce.number().int().min(30).max(86_400).default(300),
  TELEMETRY_FLUSH_SECONDS: z.coerce.number().int().min(1).max(3600).default(15),
  TELEMETRY_OUTBOX: z.string().default('.data/control-outbox.json'),
});

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  sessionSecret: string;
  storage: 'sheets' | 'file' | 'memory';
  dataFile: string;
  sheets?: { spreadsheetId: string; clientEmail: string; privateKey: string; cacheSeconds: number };
  publicUrl: string;
  allowedOrigins: string[];
  cookieSecure: boolean;
  webDist?: string;
  demoSeed: boolean;
  defaultTimezone: string;
  /** Set when this school reports to a Control console. */
  control?: {
    url: string;
    schoolId: string;
    installKey: string;
    heartbeatSeconds: number;
    flushSeconds: number;
    outboxPath: string;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat empty strings as unset so `KEY=` in a .env file means "not provided".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(
      'The API cannot start:\n' + parsed.error.issues.map((i) => `  - ${i.message}`).join('\n')
    );
  }
  const e = parsed.data;

  let sheets: Config['sheets'];
  if (e.STORAGE === 'sheets') {
    const missing = [
      ['GOOGLE_SHEETS_SPREADSHEET_ID', e.GOOGLE_SHEETS_SPREADSHEET_ID],
      ['GOOGLE_SERVICE_ACCOUNT_EMAIL', e.GOOGLE_SERVICE_ACCOUNT_EMAIL],
      ['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', e.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new ConfigError(`STORAGE=sheets needs ${missing.join(', ')}.`);
    sheets = {
      spreadsheetId: e.GOOGLE_SHEETS_SPREADSHEET_ID!,
      clientEmail: e.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      privateKey: e.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!,
      cacheSeconds: e.SHEETS_CACHE_SECONDS,
    };
  }

  const demoSeed = e.DEMO_SEED === 'true';
  if (demoSeed && e.NODE_ENV === 'production') {
    throw new ConfigError('DEMO_SEED cannot be on in production: it creates logins with a published password.');
  }
  if (!isValidTimeZone(e.DEFAULT_TIMEZONE)) throw new ConfigError(`DEFAULT_TIMEZONE "${e.DEFAULT_TIMEZONE}" is not a time zone.`);

  let control: Config['control'];
  if (e.CONTROL_URL) {
    if (!e.CONTROL_SCHOOL_ID || !e.CONTROL_INSTALL_KEY) {
      throw new ConfigError('CONTROL_URL is set, so CONTROL_SCHOOL_ID and CONTROL_INSTALL_KEY are needed too (from the Control console).');
    }
    const url = new URL(e.CONTROL_URL);
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (e.NODE_ENV === 'production' && url.protocol !== 'https:' && !local) {
      throw new ConfigError('CONTROL_URL must use https:// in production; the install key would otherwise travel in clear text.');
    }
    if (e.NODE_ENV === 'production' && e.CONTROL_INSTALL_KEY.startsWith('ik_demo')) {
      throw new ConfigError('CONTROL_INSTALL_KEY is the published demo key; get a real one from the Control console.');
    }
    control = {
      url: e.CONTROL_URL.replace(/\/$/, ''),
      schoolId: e.CONTROL_SCHOOL_ID,
      installKey: e.CONTROL_INSTALL_KEY,
      heartbeatSeconds: e.TELEMETRY_HEARTBEAT_SECONDS,
      flushSeconds: e.TELEMETRY_FLUSH_SECONDS,
      outboxPath: e.TELEMETRY_OUTBOX,
    };
  }

  return {
    control,
    env: e.NODE_ENV,
    port: e.PORT,
    sessionSecret: e.SESSION_SECRET,
    storage: e.STORAGE,
    dataFile: e.DATA_FILE,
    sheets,
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ''),
    allowedOrigins: e.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
    webDist: e.WEB_DIST,
    demoSeed,
    defaultTimezone: e.DEFAULT_TIMEZONE,
  };
}
