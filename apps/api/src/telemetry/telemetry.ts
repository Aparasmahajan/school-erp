import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import {
  SCHEMA_VERSION,
  STAFF_ROLE_KEYS,
  newId,
  percentPresent,
  safeDetail,
  todayIn,
  type AuditRow,
  type Heartbeat,
  type TelemetryEvent,
} from '@school/core';
import type { Config } from '../config';
import { activeRolesOf, getSettings, onAudit, onServerError } from '../context';
import type { Store } from '../store';

export const APP_VERSION: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

export type TelemetryOptions = NonNullable<Config['control']>;

/**
 * Main-thread side of reporting to the Control console.
 *
 * Builds two kinds of message and hands them to the worker thread, which owns delivery:
 *   event      every audit row, stripped to the privacy allow-list in @school/core
 *              (ids, dates, counts, statuses, roles; never names, phones or coordinates),
 *              plus unexpected server errors
 *   heartbeat  every few minutes: version, counts and today's attendance, no personal data
 */
export class Telemetry {
  private worker: Worker | null = null;
  private errors = 0;
  private readonly startedAt = Date.now();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: Store,
    private readonly config: Config,
    private readonly opts: TelemetryOptions
  ) {}

  start(): void {
    this.worker = new Worker(new URL('./worker.mjs', import.meta.url), {
      workerData: {
        url: this.opts.url,
        schoolId: this.opts.schoolId,
        installKey: this.opts.installKey,
        flushMs: this.opts.flushSeconds * 1000,
        outboxPath: this.opts.outboxPath,
      },
    });
    this.worker.on('error', (err) => console.error('[telemetry] worker stopped:', err));
    this.worker.unref();

    onAudit(this.store, (row) => void this.sendAudit(row));
    onServerError(this.store, (err) => this.sendError(err));

    void this.heartbeat();
    this.timer = setInterval(() => void this.heartbeat(), this.opts.heartbeatSeconds * 1000);
    this.timer.unref();
  }

  /** Ask the worker to deliver everything now. Resolves with how many events are still queued. */
  flush(): Promise<number> {
    const w = this.worker;
    if (!w) return Promise.resolve(0);
    return new Promise((resolve) => {
      const onMessage = (m: { type?: string; queued?: number }) => {
        if (m?.type === 'flushed') {
          w.off('message', onMessage);
          resolve(m.queued ?? 0);
        }
      };
      w.on('message', onMessage);
      w.postMessage({ type: 'flush' });
    });
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (!this.worker) return;
    await Promise.race([this.flush(), new Promise((r) => setTimeout(r, 5000))]);
    await this.worker.terminate();
    this.worker = null;
  }

  private post(message: { type: 'event'; event: TelemetryEvent } | { type: 'heartbeat'; data: Heartbeat }): void {
    this.worker?.postMessage(message);
  }

  private async sendAudit(row: AuditRow): Promise<void> {
    let actorRoles: string[] = [];
    try {
      actorRoles = activeRolesOf(await this.store.all('user_roles'), row.actorId);
    } catch {
      /* roles are a nicety; send the event anyway */
    }
    this.post({
      type: 'event',
      event: {
        id: row.id,
        at: row.at,
        kind: 'audit',
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        actorId: row.actorId,
        actorRoles,
        detail: safeDetail(row.before, row.after),
      },
    });
  }

  private sendError(err: unknown): void {
    this.errors += 1;
    this.post({
      type: 'event',
      event: {
        id: newId('err'),
        at: new Date().toISOString(),
        kind: 'error',
        action: 'server.error',
        entity: 'server',
        entityId: '',
        actorId: '',
        actorRoles: [],
        detail: { message: String(err instanceof Error ? err.message : err).slice(0, 200) },
      },
    });
  }

  async heartbeat(): Promise<void> {
    try {
      const [settings, students, users, userRoles, sections, attendance, staffAttendance] = await Promise.all([
        getSettings(this.store, this.config),
        this.store.all('students'),
        this.store.all('users'),
        this.store.all('user_roles'),
        this.store.all('sections'),
        this.store.all('attendance'),
        this.store.all('staff_attendance'),
      ]);
      const today = todayIn(settings.timezone);
      const todays = attendance.filter((a) => a.date === today);
      const present = todays.reduce((n, a) => n + (a.present ?? 0) + (a.late ?? 0), 0);
      const absent = todays.reduce((n, a) => n + (a.absent ?? 0), 0);
      const staffIds = new Set(
        users
          .filter((u) => u.status === 'ACTIVE' && activeRolesOf(userRoles, u.id).some((r) => STAFF_ROLE_KEYS.includes(r)))
          .map((u) => u.id)
      );
      this.post({
        type: 'heartbeat',
        data: {
          schoolId: this.opts.schoolId,
          at: new Date().toISOString(),
          appVersion: APP_VERSION,
          schemaVersion: SCHEMA_VERSION,
          storage: this.store.kind,
          schoolName: settings.schoolName,
          timezone: settings.timezone,
          students: students.filter((s) => s.status === 'ACTIVE').length,
          staff: staffIds.size,
          sections: sections.length,
          sectionsMarked: new Set(todays.map((a) => a.sectionId)).size,
          presentPct: percentPresent(present, present + absent),
          staffCheckedIn: staffAttendance.filter((s) => s.date === today && s.checkInAt && staffIds.has(s.userId)).length,
          errors: this.errors,
          queued: 0, // filled in by the worker
          dropped: 0, // filled in by the worker
          uptimeS: Math.round((Date.now() - this.startedAt) / 1000),
        },
      });
      this.errors = 0;
    } catch (err) {
      console.warn('[telemetry] skipped a heartbeat:', err);
    }
  }
}
