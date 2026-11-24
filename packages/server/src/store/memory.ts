import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decodeCells, encodeCells, isBlankRow, type ColumnSpec, type SchemaSpec } from '@school/core';
import { Mutex } from './lock';
import type { Store, TableOf } from './types';

/**
 * Keeps rows in memory as encoded cells, exactly as the sheet would hold them, so tests
 * exercise the same encode/decode path as production.
 *
 * With `persistPath` it also saves to a JSON file after every change (written to a temp
 * file and renamed, so a crash cannot leave half a file). Good for development and for a
 * single-machine pilot; not for several machines.
 */
export class MemoryStore<M> implements Store<M> {
  readonly kind: 'file' | 'memory';
  private readonly data = new Map<string, string[][]>();
  private readonly lock = new Mutex();
  private readonly tables: string[];

  constructor(
    private readonly schema: SchemaSpec<M>,
    private readonly opts: { persistPath?: string } = {}
  ) {
    this.kind = opts.persistPath ? 'file' : 'memory';
    this.tables = Object.keys(schema);
    if (opts.persistPath && existsSync(opts.persistPath)) {
      const saved = JSON.parse(readFileSync(opts.persistPath, 'utf8')) as Record<string, string[][]>;
      for (const table of this.tables) this.data.set(table, saved[table] ?? []);
    }
  }

  private spec(table: string): ColumnSpec {
    return (this.schema as Record<string, ColumnSpec>)[table];
  }

  async ensureSchema(): Promise<void> {
    for (const table of this.tables) if (!this.data.has(table)) this.data.set(table, []);
  }

  private rows(table: string): string[][] {
    let rows = this.data.get(table);
    if (!rows) {
      rows = [];
      this.data.set(table, rows);
    }
    return rows;
  }

  async all<T extends TableOf<M>>(table: T): Promise<M[T][]> {
    const spec = this.spec(table);
    return this.rows(table)
      .filter((r) => !isBlankRow(r))
      .map((r) => decodeCells<M[T]>(spec, r));
  }

  async insert<T extends TableOf<M>>(table: T, rows: M[T][]): Promise<void> {
    if (rows.length === 0) return;
    const spec = this.spec(table);
    this.rows(table).push(...rows.map((r) => encodeCells(spec, r as object)));
    this.persist();
  }

  async update<T extends TableOf<M>>(table: T, id: string, patch: Partial<M[T]>): Promise<M[T] | null> {
    const spec = this.spec(table);
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => r[0] === id);
    if (idx < 0) return null;
    const current = decodeCells<M[T]>(spec, rows[idx]);
    const next = { ...current, ...patch, id: (current as { id: string }).id } as M[T];
    rows[idx] = encodeCells(spec, next as object);
    this.persist();
    return next;
  }

  async remove<T extends TableOf<M>>(table: T, id: string): Promise<boolean> {
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => r[0] === id);
    if (idx < 0) return false;
    rows.splice(idx, 1);
    this.persist();
    return true;
  }

  async replaceAll<T extends TableOf<M>>(table: T, rows: M[T][]): Promise<void> {
    const spec = this.spec(table);
    this.data.set(table, rows.map((r) => encodeCells(spec, r as object)));
    this.persist();
  }

  exclusive<R>(fn: () => Promise<R>): Promise<R> {
    return this.lock.run(fn);
  }

  private persist(): void {
    const file = this.opts.persistPath;
    if (!file) return;
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.data)), { mode: 0o600 });
    renameSync(tmp, file);
  }
}
