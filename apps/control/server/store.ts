import { MemoryStore, SheetsStore, type Store } from '@school/server';
import type { ControlConfig } from './config';
import { CONTROL_TABLES, type ControlTables } from './schema';

export type ControlStore = Store<ControlTables>;

export function createControlStore(config: Pick<ControlConfig, 'storage' | 'dataFile' | 'sheets'>): ControlStore {
  switch (config.storage) {
    case 'sheets':
      return new SheetsStore(CONTROL_TABLES, config.sheets!);
    case 'file':
      return new MemoryStore(CONTROL_TABLES, { persistPath: config.dataFile });
    case 'memory':
      return new MemoryStore(CONTROL_TABLES);
  }
}
