/**
 * Checks the Google Sheets connection: credentials, sharing, tabs and header rows.
 * Run: npm run sheets:check
 */
import '../src/env';
import { TABLE_NAMES } from '@school/core';
import { loadConfig } from '../src/config';
import { createStore } from '../src/store';

try {
  const config = loadConfig();
  if (config.storage !== 'sheets') {
    console.error('STORAGE is not "sheets" in apps/api/.env, so there is nothing to check.');
    process.exit(1);
  }
  const store = createStore(config);
  await store.ensureSchema();
  console.log(`Connected to spreadsheet ${config.sheets!.spreadsheetId}. Tabs and headers are correct.`);
  for (const table of TABLE_NAMES) {
    console.log(`  ${table.padEnd(18)} ${(await store.all(table)).length} rows`);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Sheets check failed: ${message}`);
  if (/permission|403/i.test(message)) {
    console.error('Share the spreadsheet with the service-account email as Editor, and check the spreadsheet id.');
  }
  process.exit(1);
}
