/**
 * Storage seen by an app. Routes never talk to Google Sheets or the file system directly,
 * so moving to a database later means writing one new class.
 *
 * `M` maps table names to row types (the school schema, or the Control console's).
 */
export type TableOf<M> = keyof M & string;

export interface Store<M> {
  readonly kind: 'sheets' | 'file' | 'memory';

  /** Create tabs/header rows if missing. Safe to call repeatedly. */
  ensureSchema(): Promise<void>;

  /** Every row in a table. Returns fresh objects; mutating them changes nothing. */
  all<T extends TableOf<M>>(table: T): Promise<M[T][]>;

  insert<T extends TableOf<M>>(table: T, rows: M[T][]): Promise<void>;

  /** Merge `patch` into the row with this id. Null when no such row. The id never changes. */
  update<T extends TableOf<M>>(table: T, id: string, patch: Partial<M[T]>): Promise<M[T] | null>;

  remove<T extends TableOf<M>>(table: T, id: string): Promise<boolean>;

  /** Replace a whole table's contents. */
  replaceAll<T extends TableOf<M>>(table: T, rows: M[T][]): Promise<void>;

  /**
   * Run `fn` with no other exclusive section running at the same time. Wrap every
   * read-check-write sequence in this.
   */
  exclusive<R>(fn: () => Promise<R>): Promise<R>;
}
