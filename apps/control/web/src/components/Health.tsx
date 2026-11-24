import type { ReactNode } from 'react';
import type { Health, SchoolStatus } from '../lib/types';

/**
 * Health is shown with a colour, a shape AND a word, so it reads correctly for people
 * with colour-vision differences and in greyscale print.
 */
const HEALTH: Record<Health, { label: string; tone: string; shape: ReactNode }> = {
  live: { label: 'Live', tone: 'tone-ok', shape: <circle cx="7" cy="7" r="5" fill="var(--ok)" /> },
  stale: {
    label: 'Quiet',
    tone: 'tone-watch',
    shape: (
      <>
        <circle cx="7" cy="7" r="4.6" fill="none" stroke="var(--watch)" strokeWidth="1.6" />
        <path d="M7 2.4a4.6 4.6 0 0 1 0 9.2Z" fill="var(--watch)" />
      </>
    ),
  },
  offline: {
    label: 'Offline',
    tone: 'tone-alert',
    shape: (
      <>
        <circle cx="7" cy="7" r="4.6" fill="none" stroke="var(--alert)" strokeWidth="1.8" />
        <path d="M3.8 10.2 10.2 3.8" stroke="var(--alert)" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  never: {
    label: 'Not reporting yet',
    tone: 'tone-calm',
    shape: <circle cx="7" cy="7" r="4.6" fill="none" stroke="var(--calm)" strokeWidth="1.6" strokeDasharray="2.2 2" />,
  },
  paused: {
    label: 'Paused',
    tone: 'tone-rest',
    shape: (
      <>
        <rect x="3.6" y="3" width="2.2" height="8" rx="1" fill="var(--rest)" />
        <rect x="8.2" y="3" width="2.2" height="8" rx="1" fill="var(--rest)" />
      </>
    ),
  },
};

export function HealthBadge({ health }: { health: Health }) {
  const h = HEALTH[health];
  return (
    <span className={`badge ${h.tone}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">{h.shape}</svg>
      {h.label}
    </span>
  );
}

export function HealthShape({ health }: { health: Health }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={HEALTH[health].label}>
      {HEALTH[health].shape}
    </svg>
  );
}

export const HEALTH_LABEL = (h: Health) => HEALTH[h].label;

const STATUS: Record<SchoolStatus, { label: string; tone: string }> = {
  ONBOARDING: { label: 'Onboarding', tone: 'tone-calm' },
  LIVE: { label: 'Live', tone: 'tone-ok' },
  SUSPENDED: { label: 'Suspended', tone: 'tone-rest' },
  OFFBOARDED: { label: 'Offboarded', tone: 'tone-rest' },
};

export function StatusBadge({ status }: { status: SchoolStatus }) {
  return <span className={`badge ${STATUS[status].tone}`}>{STATUS[status].label}</span>;
}
