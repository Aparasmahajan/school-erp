import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { longDate, pct, shortDate } from '../lib/format';
import { useMe } from '../lib/session';
import type { DashboardData } from '../lib/types';
import { Avatar, Empty, Notice, Page, Spinner } from '../components/ui';

export function Dashboard() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard'), refetchInterval: 60_000 });
  const firstName = me?.user.name.split(' ')[0] ?? '';

  return (
    <Page eyebrow={me ? longDate(me.today) : ''} title={`Hello, ${firstName}`}>
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="bad">{q.error.message}</Notice>}
      {q.data && <Body d={q.data} />}
    </Page>
  );
}

function Body({ d }: { d: DashboardData }) {
  const s = d.students;
  const hasSections = s.sectionsTotal > 0;
  const maxBar = 150;
  const today = d.trend.at(-1)?.date;

  return (
    <>
      <div className="grid-kpi">
        {hasSections && (
          <section className="card kpi">
            <h2 className="label">Students present today</h2>
            <p className="value">{pct(s.pct)}</p>
            <p className="small muted">
              <span className="num strong" style={{ color: 'var(--text)' }}>{s.present}</span> present · {s.absent} absent · {s.leave} on leave
            </p>
            {s.unmarked.length > 0 && (
              <Link to="/attendance" className="small strong" style={{ color: 'var(--warn-text)' }}>
                {s.unmarked.length} {s.unmarked.length === 1 ? 'section' : 'sections'} not marked yet →
              </Link>
            )}
          </section>
        )}
        {hasSections && (
          <section className="card kpi">
            <h2 className="label">Sections marked</h2>
            <p className="value">
              {s.sectionsMarked} <small>/ {s.sectionsTotal}</small>
            </p>
            <div className="progress" role="img" aria-label={`${s.sectionsMarked} of ${s.sectionsTotal} sections marked`}>
              <span style={{ width: `${(s.sectionsMarked / Math.max(1, s.sectionsTotal)) * 100}%` }} />
            </div>
            <p className="small muted">{s.enrolled} students enrolled</p>
          </section>
        )}
        {d.staff && (
          <section className="card kpi">
            <h2 className="label">Staff checked in</h2>
            <p className="value">
              {d.staff.checkedIn} <small>/ {d.staff.total}</small>
            </p>
            <p className="small muted">{d.staff.late} arrived late</p>
            <Link to="/staff-attendance" className="small strong">
              See who's in →
            </Link>
          </section>
        )}
        {d.me && (
          <section className="card kpi">
            <h2 className="label">Your check-in today</h2>
            <p className="value">{d.me.checkInTime || '—'}</p>
            <p className="small muted">{d.me.checkOutTime ? `Checked out at ${d.me.checkOutTime}` : d.me.checkInTime ? 'Not checked out yet' : 'Not checked in yet'}</p>
            <Link to="/check-in" className="small strong">
              {d.me.checkInTime ? 'Check-in page →' : 'Check in now →'}
            </Link>
          </section>
        )}
      </div>

      {hasSections && (
        <div className="split">
          <section className="card wide">
            <div className="card-head">
              <h2>Student attendance, last {d.trend.length} school days</h2>
            </div>
            {d.trend.length === 0 ? (
              <Empty>No attendance has been marked yet.</Empty>
            ) : (
              <>
                <div className="bars" role="img" aria-label={d.trend.map((t) => `${shortDate(t.date)} ${pct(t.pct)}`).join(', ')}>
                  {d.trend.map((t) => (
                    <div key={t.date}>
                      <span className="tiny muted num">{pct(t.pct)}</span>
                      <span
                        className={`bar${t.date === today ? ' today' : ''}`}
                        style={{ height: `${Math.max(4, ((Math.max(70, t.pct ?? 70) - 70) / 30) * maxBar)}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="bar-labels" aria-hidden="true">
                  {d.trend.map((t) => (
                    <span key={t.date}>{shortDate(t.date)}</span>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="narrow">
            <section className="card">
              <div className="card-head">
                <h2>Not marked yet</h2>
              </div>
              {s.unmarked.length === 0 ? (
                <p className="small muted">Every section you look after is marked.</p>
              ) : (
                <div className="stack">
                  {s.unmarked.slice(0, 6).map((u) => (
                    <Link key={u.sectionId} to={`/attendance?section=${u.sectionId}`} className="row-center" style={{ textDecoration: 'none', color: 'inherit', minHeight: 44 }}>
                      <span className="badge badge-warn">{u.label}</span>
                      <span className="small muted">{u.classTeacherName || 'No class teacher assigned'}</span>
                    </Link>
                  ))}
                  {s.unmarked.length > 6 && <p className="small muted">and {s.unmarked.length - 6} more</p>}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Absent 3+ days running</h2>
              </div>
              {d.streaks.length === 0 ? (
                <p className="small muted">Nobody right now.</p>
              ) : (
                <div className="stack">
                  {d.streaks.map((x) => (
                    <Link key={x.studentId} to={`/students?open=${x.studentId}`} className="row-center" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Avatar name={x.name} />
                      <span style={{ flex: 1 }}>
                        <span className="small strong" style={{ display: 'block' }}>{x.name}</span>
                        <span className="tiny muted">
                          {x.sectionLabel} · {x.days} days
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {!hasSections && !d.me && <Empty>There's nothing on your dashboard yet. Use the menu to get started.</Empty>}
    </>
  );
}
