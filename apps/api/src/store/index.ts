import type { Config } from '../config';
import { MemoryStore } from './memory';
import { SheetsStore } from './sheets';
import type { Store } from './types';

export type { Store } from './types';
export { MemoryStore } from './memory';
export { SheetsStore } from './sheets';

export function createStore(config: Config): Store {
  switch (config.storage) {
    case 'sheets':
      return new SheetsStore(config.sheets!);
    case 'file':
      return new MemoryStore({ persistPath: config.dataFile });
    case 'memory':
      return new MemoryStore();
  }
}
