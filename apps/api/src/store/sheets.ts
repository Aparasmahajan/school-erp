import { TABLES, type Tables } from '@school/core';
import { SheetsStore as GenericSheetsStore, type SheetsStoreOptions } from '@school/server';

/** Google Sheets store bound to the school schema: one spreadsheet per school. */
export class SheetsStore extends GenericSheetsStore<Tables> {
  constructor(opts: SheetsStoreOptions) {
    super(TABLES, opts);
  }
}
