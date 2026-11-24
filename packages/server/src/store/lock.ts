/**
 * Runs async functions one at a time, in arrival order.
 *
 * Spreadsheets have no transactions, so "check, then write" sequences (is this admission
 * number free? has this section already been marked today?) must not interleave. This
 * only protects a SINGLE process, which is why each deployment runs exactly one.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<R>(fn: () => Promise<R>): Promise<R> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
