import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roleLabel, type RoleKey } from '@school/core/browser';
import { api } from '../lib/api';
import { distance, longDate } from '../lib/format';
import { useMe } from '../lib/session';
import type { StaffRecord } from '../lib/types';
import { Avatar, Empty, Notice, Page, Spinner } from '../components/ui';

interface Data {
  date: string;
  staffStartTime: string;
  staff: { userId: string; name: string; roles: RoleKey[]; record: StaffRecord | null }[];
  totals: { staff: number; checkedIn: number; late: number };
}

export function StaffAttendance() {
  const { data: me } = useMe();
  const [date, setDate] = useState(me?.today ?? '');
  const q = useQuery({
    queryKey: ['staff-attendance', date],
    queryFn: () => api<Data>(`/api/staff-attendance?date=${date}`),
    enabled: !!date,
    refetchInterval: 60_000,
  });
  const d = q.data;

  return (
    <Page eyebrow={date ? longDate(date) : ''} title="Staff attendance">
      <div className="row">
        <label className="field">
          Date
          <input className="input" type="date" value={date} max={me?.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {d && (
          <p className="small muted" style={{ paddingBottom: 12 }}>
            <strong className="num" style={{ color: 'var(--text)' }}>{d.totals.checkedIn}</strong> of {d.totals.staff} checked in · {d.totals.late} after {d.staffStartTime}
          </p>
        )}
      </div>
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="bad">{q.error.message}</Notice>}
      {d && d.staff.length === 0 && <Empty>No staff to show.</Empty>}
      {d && d.staff.length > 0 && (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Checked in</th>
                  <th scope="col">Checked out</th>
                  <th scope="col">Where</th>
                </tr>
              </thead>
              <tbody>
                {d.staff.map(({ userId, name, roles, record: r }) => (
                  <tr key={userId}>
                    <td>
                      <div className="name-cell">
                        <Avatar name={name} />
                        <div>
                          <p className="small strong">{name}</p>
                          <p className="tiny muted">{roles.map(roleLabel).join(', ')}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r?.checkInTime ? (
                        <span className="row-center">
                          <span className="num strong">{r.checkInTime}</span>
                          {r.late ? <span className="badge badge-warn">Late</span> : <span className="badge badge-ok">On time</span>}
                        </span>
                      ) : (
                        <span className="badge badge-muted">Not in</span>
                      )}
                    </td>
                    <td className="num">{r?.checkOutTime || '—'}</td>
                    <td>
                      {r?.checkInZone ? (
                        <>
                          <p className="small">{r.checkInZone}</p>
                          <p className="tiny muted">
                            {distance(r.checkInDistanceM)} from centre · ±{r.checkInAccuracyM ?? '?'} m
                            {r.checkInLat != null && r.checkInLng != null && (
                              <>
                                {' · '}
                                <a href={`https://www.google.com/maps?q=${r.checkInLat},${r.checkInLng}`} target="_blank" rel="noreferrer">
                                  map
                                </a>
                              </>
                            )}
                          </p>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Page>
  );
}
