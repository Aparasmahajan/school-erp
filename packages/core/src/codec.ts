import { TABLES, type ColType, type TableName, type Tables } from './tables';

/**
 * Converts rows to and from spreadsheet cells. Every store (Sheets, local file, tests)
 * goes through this, so a value that survives a test round trip survives the real sheet.
 *
 * Everything is written as TEXT. Writing with valueInputOption RAW keeps "2019/0412" from
 * becoming a date and "=SUM()" from becoming a formula.
 */

export type ColumnSpec = Record<string, ColType>;

export function encodeCells(spec: ColumnSpec, row: object): string[] {
  const obj = row as Record<string, unknown>;
  return Object.keys(spec).map((key) => {
    const value = obj[key];
    if (value === undefined || value === null) return '';
    switch (spec[key]) {
      case 'json':
        return JSON.stringify(value);
      case 'boolean':
        return value ? 'TRUE' : 'FALSE';
      default:
        return String(value);
    }
  });
}

export function decodeCells<T>(spec: ColumnSpec, cells: readonly unknown[]): T {
  const out: Record<string, unknown> = {};
  Object.keys(spec).forEach((key, i) => {
    const raw = cells[i];
    const text = raw === undefined || raw === null ? '' : String(raw);
    switch (spec[key]) {
      case 'number': {
        const n = Number(text);
        out[key] = text.trim() === '' || !Number.isFinite(n) ? null : n;
        break;
      }
      case 'boolean':
        out[key] = raw === true || text.trim().toUpperCase() === 'TRUE';
        break;
      case 'json':
        if (text.trim() === '') {
          out[key] = null;
        } else {
          try {
            out[key] = JSON.parse(text);
          } catch {
            out[key] = null;
          }
        }
        break;
      default:
        out[key] = text;
    }
  });
  return out as T;
}

/** School-schema shortcuts. */
export function encodeRow<T extends TableName>(table: T, row: Tables[T]): string[] {
  return encodeCells(TABLES[table] as ColumnSpec, row);
}

export function decodeRow<T extends TableName>(table: T, cells: readonly unknown[]): Tables[T] {
  return decodeCells<Tables[T]>(TABLES[table] as ColumnSpec, cells);
}

export function isBlankRow(cells: readonly unknown[]): boolean {
  return cells.every((c) => c === undefined || c === null || String(c).trim() === '');
}
