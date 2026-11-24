import type { ControlConfig } from './config';
import type { SchoolRecord } from './schema';

export type Health = 'live' | 'stale' | 'offline' | 'never' | 'paused';

/** Compare "0.10.2" with "0.9.0" numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function latestVersion(schools: SchoolRecord[]): string {
  return schools.map((s) => s.appVersion).filter(Boolean).sort(compareVersions).at(-1) ?? '';
}

/**
 * How a school is doing, from its last report. Each problem is a plain sentence the
 * console shows as-is.
 */
export function healthOf(
  school: SchoolRecord,
  cfg: Pick<ControlConfig, 'staleAfterMs' | 'offlineAfterMs'>,
  latest: string,
  now = Date.now()
): { health: Health; issues: string[] } {
  const issues: string[] = [];
  if (school.status === 'SUSPENDED' || school.status === 'OFFBOARDED') {
    return { health: 'paused', issues: [school.status === 'SUSPENDED' ? 'Suspended' : 'Offboarded'] };
  }
  if (!school.lastSeenAt) return { health: 'never', issues: ['Has not reported yet'] };

  const age = now - Date.parse(school.lastSeenAt);
  const health: Health = age <= cfg.staleAfterMs ? 'live' : age <= cfg.offlineAfterMs ? 'stale' : 'offline';
  if (health !== 'live') issues.push(`No report for ${describeAge(age)}`);

  const s = school.snapshot ?? {};
  if ((s.errors ?? 0) > 0) issues.push(`${s.errors} server ${s.errors === 1 ? 'error' : 'errors'} in its last report`);
  if ((s.dropped ?? 0) > 0) issues.push(`Lost ${s.dropped} audit events while it couldn't reach us`);
  if ((s.queued ?? 0) > 200) issues.push(`${s.queued} audit events waiting to be sent`);
  if (s.storage === 'memory') issues.push('Running in test mode: nothing is being saved');
  if (latest && school.appVersion && compareVersions(school.appVersion, latest) < 0) {
    issues.push(`Running ${school.appVersion}; newest is ${latest}`);
  }
  return { health, issues };
}

export function describeAge(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}
