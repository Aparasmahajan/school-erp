import { auth as googleAuth, sheets as sheetsApi, type sheets_v4 } from '@googleapis/sheets';
import { decodeCells, encodeCells, isBlankRow, type ColumnSpec, type SchemaSpec } from '@school/core';
import { Mutex } from './lock';
import type { Store, TableOf } from './types';

/**
 * Google Sheets storage: one spreadsheet per deployment, one tab per table, row 1 = headers.
 *
 * Quota: Google allows roughly 60 reads and 60 writes per minute per service account.
 *   - Reads are cached for `cacheSeconds`, and a refresh loads EVERY stale tab in a single
 *     batchGet call, so a page needing six tables costs one request, not six.
 *   - This process invalidates its cache on its own writes, so it always sees them.
 *   - 429s and 5xx responses are retried with backoff.
 *
 * Consistency: spreadsheets have no transactions. Callers wrap read-check-write sequences
 * in exclusive(), and updates re-read the tab first so they hit the right row. Run ONE
 * process per spreadsheet. Hand-editing the sheet while the app is in use (inserting or
 * deleting rows) can still race with a write; treat the sheet as read-only for people.
 */

type Cell = string | number | boolean;

export interface SheetsStoreOptions {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
  cacheSeconds: number;
}

function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [e.response?.status, e.status, e.code]) if (typeof v === 'number') return v;
  return undefined;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = statusOf(err);
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt >= 4) throw err;
      const waitMs = 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
      console.warn(`[sheets] ${label} returned ${status}; retrying in ${waitMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export class SheetsStore<M> implements Store<M> {
  readonly kind = 'sheets' as const;
  private readonly api: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly cacheMs: number;
  private readonly tables: string[];
  private readonly cache = new Map<string, { at: number; rows: Cell[][] }>();
  private readonly sheetIds = new Map<string, number>();
  private schemaReady: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;
  private readonly writeLock = new Mutex();
  private readonly opLock = new Mutex();

  constructor(
    private readonly schema: SchemaSpec<M>,
    opts: SheetsStoreOptions
  ) {
    const jwt = new googleAuth.JWT({
      email: opts.clientEmail,
      key: opts.privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.api = sheetsApi({ version: 'v4', auth: jwt });
    this.spreadsheetId = opts.spreadsheetId;
    this.cacheMs = opts.cacheSeconds * 1000;
    this.tables = Object.keys(schema);
  }

  private spec(table: string): ColumnSpec {
    return (this.schema as Record<string, ColumnSpec>)[table];
  }

  // ── schema ──

  ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.createMissingTabs().catch((err) => {
        this.schemaReady = null;
        throw err;
      });
    }
    return this.schemaReady;
  }

  private async createMissingTabs(): Promise<void> {
    const spreadsheetId = this.spreadsheetId;
    const meta = await withRetry('read spreadsheet', () =>
      this.api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' })
    );
    for (const s of meta.data.sheets ?? []) {
      const p = s.properties;
      if (p?.title && p.sheetId != null) this.sheetIds.set(p.title, p.sheetId);
    }

    const missing = this.tables.filter((t) => !this.sheetIds.has(t));
    if (missing.length) {
      const res = await withRetry('create tabs', () =>
        this.api.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: missing.map((title) => ({
              addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } },
            })),
          },
        })
      );
      for (const reply of res.data.replies ?? []) {
        const p = reply.addSheet?.properties;
        if (p?.title && p.sheetId != null) this.sheetIds.set(p.title, p.sheetId);
      }
    }

    // Header rows: write them where absent, extend them where columns were added at the
    // end, and refuse anything else rather than silently misreading every row.
    const headers = await withRetry('read headers', () =>
      this.api.spreadsheets.values.batchGet({ spreadsheetId, ranges: this.tables.map((t) => `${t}!1:1`) })
    );
    const writes: sheets_v4.Schema$ValueRange[] = [];
    this.tables.forEach((table, i) => {
      const found = (headers.data.valueRanges?.[i]?.values?.[0] ?? []).map((h) => String(h).trim());
      const expected = Object.keys(this.spec(table));
      const isPrefix = found.length <= expected.length && found.every((h, j) => h === expected[j]);
      if (isPrefix && found.length < expected.length) {
        writes.push({ range: `${table}!A1`, values: [expected] });
      } else if (!isPrefix) {
        throw new Error(
          `Tab "${table}" has columns [${found.join(', ')}] but this version expects [${expected.join(', ')}]. ` +
            'Fix the header row (new columns go at the end) before starting.'
        );
      }
    });
    if (writes.length) {
      await withRetry('write headers', () =>
        this.api.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data: writes },
        })
      );
    }
  }

  // ── reads ──

  private isFresh(table: string): boolean {
    const entry = this.cache.get(table);
    return !!entry && Date.now() - entry.at <= this.cacheMs;
  }

  private async fetchTables(tables: string[]): Promise<void> {
    if (tables.length === 0) return;
    const res = await withRetry(`read ${tables.join(', ')}`, () =>
      this.api.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges: tables.map((t) => `${t}!A2:Z`),
        valueRenderOption: 'UNFORMATTED_VALUE',
      })
    );
    const at = Date.now();
    tables.forEach((t, i) => {
      this.cache.set(t, { at, rows: (res.data.valueRanges?.[i]?.values ?? []) as Cell[][] });
    });
  }

  private async ensureFresh(table: string): Promise<void> {
    await this.ensureSchema();
    if (this.isFresh(table)) return;
    if (!this.refreshing) {
      const stale = this.tables.filter((t) => !this.isFresh(t));
      this.refreshing = this.fetchTables(stale).finally(() => {
        this.refreshing = null;
      });
    }
    await this.refreshing;
    if (!this.cache.has(table)) await this.fetchTables([table]);
  }

  async all<T extends TableOf<M>>(table: T): Promise<M[T][]> {
    await this.ensureFresh(table);
    const spec = this.spec(table);
    return (this.cache.get(table)?.rows ?? []).filter((r) => !isBlankRow(r)).map((r) => decodeCells<M[T]>(spec, r));
  }

  // ── writes ──

  async insert<T extends TableOf<M>>(table: T, rows: M[T][]): Promise<void> {
    if (rows.length === 0) return;
    await this.ensureSchema();
    const spec = this.spec(table);
    await this.writeLock.run(async () => {
      await withRetry(`append ${table}`, () =>
        this.api.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${table}!A1`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: rows.map((r) => encodeCells(spec, r as object)) },
        })
      );
      // Append may land in a gap a person left in the sheet, so re-read instead of guessing.
      this.cache.delete(table);
    });
  }

  async update<T extends TableOf<M>>(table: T, id: string, patch: Partial<M[T]>): Promise<M[T] | null> {
    await this.ensureSchema();
    const spec = this.spec(table);
    return this.writeLock.run(async () => {
      await this.fetchTables([table]); // fresh row positions
      const rows = this.cache.get(table)!.rows;
      const idx = rows.findIndex((r) => String(r[0] ?? '') === id);
      if (idx < 0) return null;
      const current = decodeCells<M[T]>(spec, rows[idx]);
      const next = { ...current, ...patch, id: (current as { id: string }).id } as M[T];
      const encoded = encodeCells(spec, next as object);
      await withRetry(`update ${table}`, () =>
        this.api.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${table}!A${idx + 2}`,
          valueInputOption: 'RAW',
          requestBody: { values: [encoded] },
        })
      );
      rows[idx] = encoded;
      return next;
    });
  }

  async remove<T extends TableOf<M>>(table: T, id: string): Promise<boolean> {
    await this.ensureSchema();
    return this.writeLock.run(async () => {
      await this.fetchTables([table]);
      const idx = this.cache.get(table)!.rows.findIndex((r) => String(r[0] ?? '') === id);
      if (idx < 0) return false;
      const sheetId = this.sheetIds.get(table);
      if (sheetId == null) throw new Error(`No sheet id known for tab "${table}"`);
      await withRetry(`delete from ${table}`, () =>
        this.api.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx + 1, endIndex: idx + 2 } } },
            ],
          },
        })
      );
      this.cache.delete(table);
      return true;
    });
  }

  async replaceAll<T extends TableOf<M>>(table: T, rows: M[T][]): Promise<void> {
    await this.ensureSchema();
    const spec = this.spec(table);
    await this.writeLock.run(async () => {
      await withRetry(`clear ${table}`, () =>
        this.api.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range: `${table}!A2:Z` })
      );
      if (rows.length) {
        await withRetry(`write ${table}`, () =>
          this.api.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${table}!A2`,
            valueInputOption: 'RAW',
            requestBody: { values: rows.map((r) => encodeCells(spec, r as object)) },
          })
        );
      }
      this.cache.delete(table);
    });
  }

  exclusive<R>(fn: () => Promise<R>): Promise<R> {
    return this.opLock.run(fn);
  }
}
