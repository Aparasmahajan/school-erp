import { TABLES, type Tables } from '@school/core';
import { MemoryStore as GenericMemoryStore } from '@school/server';

/** In-memory / single-file store bound to the school schema. */
export class MemoryStore extends GenericMemoryStore<Tables> {
  constructor(opts: { persistPath?: string } = {}) {
    super(TABLES, opts);
  }
}
