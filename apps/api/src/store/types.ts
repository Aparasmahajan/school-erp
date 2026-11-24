import type { Tables } from '@school/core';
import type { Store as GenericStore } from '@school/server';

/** The school app's storage: the shared Store, bound to the school schema. */
export type Store = GenericStore<Tables>;
