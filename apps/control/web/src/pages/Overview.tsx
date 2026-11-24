import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ago, day, n, pct, weekdayLetter } from '../lib/format';
import type { Overview as Data, OverviewSchool } from '../lib/types';
import { HEALTH_LABEL, HealthBadge, HealthShape } from '../components/Health';
import { Empty, Notice, Page, Spinner } from '../components/ui';

export function Overview() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<Data>('/api/overview'), refetchInterval: 60_000 });
  const d = q.data;
  return (
    <Page eyebrow={d ? `${new Date(`${d.today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} · updates every minute` : ''} title="The network today">
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="alert">{q.error.message}</Notice>}
      {d && d.schools.length === 0 && <Empty>No schools yet. Onboard the first one from <Link to="/schools">Schools</Link>.</Empty>}
      {d && d.schools.length > 0 && <Body d={d} />}
    </Page>
  );
}

function Body({ d }: { d: Data }) {
  const t = d.totals;
  const attention = d.schools.filter((s) => s.health !== 'live' || s.issues.length > 0);
  const quiet = (['stale', 'offline', 'never', 'paused'] as const).filter((h) => t[h] > 0);

  return (
    <>
      <section className="strip" aria-label="Totals">
        <div>
          <p className="label">Schools live</p>
          <p className="value">{t.live}<span className="muted" style={{ fontSize: 20 }}> / {t.schools}</span></p>
          <p className="sub row-c" style={{ gap: 12 }}>
            {quiet.length === 0
              ? 'Every school is reporting'
              : quiet.map((h) => (
                  <span key={h} className="row-c" style={{ gap: 5 }}>
                    <HealthShape health={h} /> {t[h]} {HEALTH_LABEL(h).toLowerCase()}
                  </span>
                ))}
          </p>
        </div>
        <div>
          <p className="label">Students</p>
          <p className="value">{n(t.students)}</p>
          <p className="sub">across every reporting school</p>
        </div>
        <div>
          <p className="label">Staff</p>
          <p className="value">{n(t.staff)}</p>
          <p className="sub">with active accounts</p>
        </div>
        <div>
          <p className="label">Activity, last 24 h</p>
          <p className="value">{n(t.events24h)}</p>
          <p className="sub">audit trail entries</p>
        </div>
        <div>
          <p className="label">Server errors, last 24 h</p>
          <p className={`value${t.errors24h ? ' alert' : ''}`}>{n(t.errors24h)}</p>
          <p className="sub">{t.errors24h ? 'see the trail for details' : 'none reported'}</p>
        </div>
      </section>

      {attention.length > 0 && (
        <section className="card" aria-labelledby="attn">
          <div className="card-head"><h2 id="attn">Needs a look</h2><span className="tiny muted">{attention.length} {attention.length === 1 ? 'school' : 'schools'}</span></div>
          <div className="stack" style={{ gap: 0 }}>
            {attention.map((s) => (
              <Link key={s.id} to={`/schools/${s.id}`} className="row-c" style={{ textDecoration: 'none', color: 'inherit', padding: '10px 0', borderTop: '1px solid var(--line)', alignItems: 'flex-start' }}>
                <span style={{ paddingTop: 3 }}><HealthShape health={s.health} /></span>
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <span className="strong">{s.name}</span> <span className="tiny muted">{s.city}</span>
                  <span className="small muted" style={{ display: 'block' }}>{s.issues.join(' · ')}</span>
                </span>
                <span className="tiny muted">{s.lastSeenAt ? `last report ${ago(s.lastSeenAt)}` : 'never reported'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="board" className="stack">
        <h2 id="board" className="section-title">Every school</h2>
        <div className="grid-cards">{d.schools.map((s) => <SchoolCard key={s.id} s={s} />)}</div>
      </section>

      <Heatmap d={d} />
    </>
  );
}

function SchoolCard({ s }: { s: OverviewSchool }) {
  const marked = s.sections ? Math.round(((s.sectionsMarked ?? 0) / s.sections) * 100) : 0;
  return (
    <Link to={`/schools/${s.id}`} className="card school-card">
      <div className="row-c" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="name">{s.name}</p>
          <p className="tiny muted">{[s.city, s.board, s.code].filter(Boolean).join(' · ')}</p>
        </div>
        <HealthBadge health={s.health} />
      </div>
      <div className="metrics">
        <div><p>Students</p><p>{n(s.students)}</p></div>
        <div><p>Staff in</p><p>{s.staff ? `${s.staffCheckedIn ?? 0}/${s.staff}` : '—'}</p></div>
        <div><p>Present</p><p>{pct(s.presentPct)}</p></div>
      </div>
      <div>
        <div className="row-c tiny muted" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span>Sections marked today</span>
          <span className="num">{s.sections ? `${s.sectionsMarked ?? 0} / ${s.sections}` : '—'}</span>
        </div>
        <div className="bar" role="img" aria-label={`${marked}% of sections marked`}><span style={{ width: `${marked}%` }} /></div>
      </div>
      <p className="tiny muted">{s.lastSeenAt ? `Last report ${ago(s.lastSeenAt)}` : 'Waiting for its first report'}{s.appVersion && ` · version ${s.appVersion}`}</p>
    </Link>
  );
}

function Heatmap({ d }: { d: Data }) {
  const max = Math.max(1, ...d.schools.flatMap((s) => s.activity));
  const bucket = (v: number) => (v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const columns = `minmax(130px, 220px) repeat(${d.days.length}, minmax(14px, 26px))`;
  return (
    <section className="card" aria-labelledby="heat">
      <div className="card-head">
        <h2 id="heat">Activity, last two weeks</h2>
        <span className="legend" aria-hidden="true">
          fewer {[0, 1, 2, 3, 4, 5].map((b) => <span key={b} className={`sw`} style={{ background: `var(--heat-${b})` }} />)} more
        </span>
      </div>
      <p className="small muted" style={{ marginBottom: 14 }}>Audit trail entries per school per day. Empty Sundays are normal; an empty weekday usually means the school stopped reporting.</p>
      <div className="table-wrap">
        <div className="heat" style={{ gridTemplateColumns: columns }}>
          <span />
          {d.days.map((day_) => <span key={day_} className="day" title={day(day_)}>{weekdayLetter(day_)}</span>)}
          {d.schools.map((s) => (
            <Row key={s.id} s={s} days={d.days} bucket={bucket} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({ s, days, bucket }: { s: OverviewSchool; days: string[]; bucket: (v: number) => number }) {
  return (
    <>
      <Link to={`/schools/${s.id}`} className="lbl" style={{ color: 'inherit', textDecoration: 'none' }}>{s.name}</Link>
      {s.activity.map((v, i) => (
        <span key={days[i]} className={`cell h${bucket(v)}`} role="img" aria-label={`${s.name}, ${day(days[i])}: ${v} entries`} title={`${day(days[i])}: ${v} entries`} />
      ))}
    </>
  );
}
