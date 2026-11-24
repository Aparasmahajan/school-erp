import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { checkZones, distanceMeters, type Zone, type ZoneCheck } from '@school/core/browser';
import { api } from '../lib/api';
import { distance, longDate } from '../lib/format';
import { offsetMeters, useGeolocation, type GeoReading } from '../lib/geo';
import { useAccess } from '../lib/session';
import type { StaffMe } from '../lib/types';
import { Icon } from '../components/Icon';
import { Notice, Page, Spinner } from '../components/ui';

/**
 * Geofenced check-in. The device's location is checked here only to unlock the buttons
 * and explain what's wrong; the server checks it again and its answer is final.
 */
export function CheckIn() {
  const qc = useQueryClient();
  const access = useAccess();
  const me = useQuery({ queryKey: ['staff-me'], queryFn: () => api<StaffMe>('/api/staff-attendance/me') });
  const geo = useGeolocation(!!me.data);

  const zones = me.data?.zones ?? [];
  const reading = geo.reading;
  const check: ZoneCheck | null = me.data && reading ? checkZones(reading, reading.accuracyM, zones, me.data.maxAccuracyM) : null;
  const record = me.data?.record ?? null;

  const action = useMutation({
    mutationFn: (kind: 'in' | 'out') =>
      api<{ zone: string; distanceM: number }>('/api/staff-attendance/check', {
        method: 'POST',
        body: { action: kind, lat: reading!.lat, lng: reading!.lng, accuracyM: reading!.accuracyM },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-me'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const inside = check?.ok === true;
  const canIn = inside && !record?.checkInAt;
  const canOut = inside && !!record?.checkInAt && !record.checkOutAt;

  return (
    <Page eyebrow={me.data ? longDate(me.data.today) : ''} title="My check-in">
      {me.isPending && <Spinner />}
      {me.error && <Notice tone="bad">{me.error.message}</Notice>}
      {me.data && (
        <div className="split">
          <div className="wide stack">
            <StatusPanel geo={geo} check={check} zones={zones} maxAccuracyM={me.data.maxAccuracyM} manage={access.can('geofences.manage')} />

            <div className="row">
              <button type="button" className="btn btn-primary" style={{ flex: '1 1 200px', minHeight: 56, fontSize: 16 }} disabled={!canIn || action.isPending} onClick={() => action.mutate('in')}>
                <Icon name="check" /> Check in
              </button>
              <button type="button" className="btn" style={{ flex: '1 1 200px', minHeight: 56, fontSize: 16 }} disabled={!canOut || action.isPending} onClick={() => action.mutate('out')}>
                Check out
              </button>
            </div>
            {action.error && <Notice tone="bad">{action.error.message}</Notice>}
            {action.isSuccess && (
              <Notice tone="ok">
                Done: recorded at {action.data.zone}, {distance(action.data.distanceM)} from its centre.
              </Notice>
            )}
            <p className="tiny muted">
              Your location is saved with each check-in and check-out so the office can confirm where it happened. It isn't tracked at any other time.
            </p>
          </div>

          <aside className="narrow">
            <section className="card stack">
              <h2>Today</h2>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14 }}>
                <dt className="muted">Checked in</dt>
                <dd style={{ margin: 0 }} className="strong num">
                  {record?.checkInTime || '—'} {record?.late && <span className="badge badge-warn">Late</span>}
                </dd>
                <dt className="muted">Checked out</dt>
                <dd style={{ margin: 0 }} className="strong num">{record?.checkOutTime || '—'}</dd>
                <dt className="muted">Zone</dt>
                <dd style={{ margin: 0 }}>{record?.checkInZone || '—'}</dd>
                <dt className="muted">Start time</dt>
                <dd style={{ margin: 0 }} className="num">{me.data.staffStartTime}</dd>
              </dl>
            </section>
            {reading && zones.length > 0 && <Radar reading={reading} zones={zones} />}
          </aside>
        </div>
      )}
    </Page>
  );
}

function StatusPanel({
  geo,
  check,
  zones,
  maxAccuracyM,
  manage,
}: {
  geo: ReturnType<typeof useGeolocation>;
  check: ZoneCheck | null;
  zones: Zone[];
  maxAccuracyM: number;
  manage: boolean;
}) {
  const panel = (tone: 'ok' | 'warn' | 'bad' | 'idle', title: string, body: ReactNode, retry = false) => (
    <div className={`geo-state ${tone}`} role="status" aria-live="polite">
      <Icon name="pin" size={32} />
      <div className="stack" style={{ gap: 6, flex: 1 }}>
        <h2>{title}</h2>
        <div className="small">{body}</div>
        {retry && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={geo.retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );

  if (zones.length === 0) {
    return panel('warn', 'No attendance zone yet', manage ? <>Set one up on <Link to="/zones">Attendance zones</Link> first.</> : 'Ask the school office to set up an attendance zone.');
  }
  switch (geo.status) {
    case 'insecure':
      return panel('bad', 'Location needs a secure connection', 'Open the app over https:// (or the Windows app) to check in.');
    case 'unsupported':
      return panel('bad', "This device can't share its location", 'Use a phone or a laptop with location services.');
    case 'denied':
      return panel(
        'bad',
        'Location permission is off',
        'Allow location for this site in your browser settings (on Windows: Settings › Privacy › Location), then try again.',
        true
      );
    case 'error':
      return panel('bad', "Couldn't get your location", geo.message || 'Move near a window or outdoors.', true);
    case 'idle':
    case 'locating':
      return panel('idle', 'Finding your location…', 'Allow location access when your browser asks.');
    case 'ready':
      break;
  }
  if (!check) return null;
  if (check.ok) {
    return panel('ok', `You're inside ${check.zone.name}`, `${distance(check.distanceM)} from its centre, accurate to ±${check.accuracyM} m. You can check in or out.`);
  }
  if (check.reason === 'INACCURATE') {
    return panel('warn', 'Location not precise enough yet', `Accurate to ±${check.accuracyM} m; it needs ±${maxAccuracyM} m or better. Turn on precise location, or move near a window. This often improves within a minute.`);
  }
  if (check.reason === 'OUTSIDE') {
    return panel('bad', `You're outside ${check.nearest?.name ?? 'the zone'}`, `About ${distance(check.outsideByM)} from its edge. Check-in opens once you're inside.`);
  }
  return panel('bad', 'Location reading is not valid', 'Try again in a moment.', true);
}

/** Where you are relative to the nearest zone. A sketch, not a map. */
function Radar({ reading, zones }: { reading: GeoReading; zones: Zone[] }) {
  const zone = [...zones].sort((a, b) => distanceMeters(reading, a) - distanceMeters(reading, b))[0];
  const { x, y } = offsetMeters(zone, reading);
  const span = Math.max(zone.radiusM * 1.4, Math.hypot(x, y) * 1.2, reading.accuracyM * 1.1, 50);
  const k = 100 / span;
  const px = Math.max(-112, Math.min(112, x * k));
  const py = Math.max(-112, Math.min(112, -y * k));
  return (
    <section className="card stack">
      <h2>{zone.name}</h2>
      <svg className="radar" viewBox="-120 -120 240 240" role="img" aria-label={`You are ${Math.round(Math.hypot(x, y))} metres from the centre of ${zone.name}, which has a ${zone.radiusM} metre radius.`}>
        <circle r={zone.radiusM * k} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
        <circle r="3" fill="var(--accent)" />
        <circle cx={px} cy={py} r={Math.max(4, reading.accuracyM * k)} fill="rgba(20,32,46,0.10)" stroke="rgba(20,32,46,0.35)" />
        <circle cx={px} cy={py} r="6" fill="#14202e" stroke="#fff" strokeWidth="2" />
      </svg>
      <p className="tiny muted">Green circle: the zone ({zone.radiusM} m radius). Dark dot: you, with the shaded area showing how precise your reading is.</p>
    </section>
  );
}
