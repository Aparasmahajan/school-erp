import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { when } from '../lib/format';
import { actionLabel, detailSummary, rolesLabel } from '../lib/labels';
import { useMe } from '../lib/session';
import type { School, TrailEvent } from '../lib/types';
import { Empty, Notice, Page, Spinner } from '../components/ui';

const PAGE = 50;

/** Everything every school reported, newest first. Personal data never reaches here. */
export function Trail() {
  const tz = useMe().data?.displayTimezone ?? 'Asia/Kolkata';
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const filters = {
    schoolId: params.get('schoolId') ?? '',
    kind: params.get('kind') ?? '',
    action: params.get('action') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
  const set = (k: keyof typeof filters, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(0);
  };

  const schools = useQuery({ queryKey: ['schools'], queryFn: () => api<{ schools: School[] }>('/api/schools') });
  const qs = new URLSearchParams({ ...filters, q, limit: String(PAGE), offset: String(page * PAGE) });
  const trail = useQuery({
    queryKey: ['trail', qs.toString()],
    queryFn: () => api<{ total: number; actions: string[]; events: TrailEvent[] }>(`/api/events?${qs}`),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });
  const d = trail.data;

  return (
    <Page eyebrow={d ? `${d.total.toLocaleString('en-IN')} entries match` : ''} title="Audit trail">
      <p className="small muted" style={{ maxWidth: 760 }}>
        What happened in each school: who (by role) did what, when, with counts and ids. Names, phone numbers, emails and locations stay inside each school and never appear here.
      </p>
      <div className="row">
        <label className="field">
          School
          <select className="select" value={filters.schoolId} onChange={(e) => set('schoolId', e.target.value)}>
            <option value="">All schools</option>
            {(schools.data?.schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">
          Kind
          <select className="select" value={filters.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="">Everything</option>
            <option value="audit">Actions</option>
            <option value="error">Server errors</option>
          </select>
        </label>
        <label className="field">
          Action
          <select className="select" value={filters.action} onChange={(e) => set('action', e.target.value)}>
            <option value="">Any action</option>
            {(d?.actions ?? []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </label>
        <label className="field">From<input className="input" type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label className="field">To<input className="input" type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label className="field grow">Search<input className="input" type="search" placeholder="Action, record id, school code" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
      </div>

      {trail.isPending && <Spinner />}
      {trail.error && <Notice tone="alert">{trail.error.message}</Notice>}
      {d && d.events.length === 0 && <Empty>Nothing matches these filters.</Empty>}
      {d && d.events.length > 0 && (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 900 }}>
              <thead><tr><th scope="col">When</th><th scope="col">School</th><th scope="col">What</th><th scope="col">By</th><th scope="col">Details</th></tr></thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={`${e.schoolId}:${e.id}`}>
                    <td className="small num" style={{ whiteSpace: 'nowrap' }}>{when(e.at, tz)}</td>
                    <td><Link to={`/schools/${e.schoolId}`} style={{ color: 'var(--ink)', textDecoration: 'none' }} className="small strong">{e.schoolName}</Link><p className="tiny muted mono">{e.schoolCode}</p></td>
                    <td>{e.kind === 'error' ? <span className="badge tone-alert">{actionLabel(e.action)}</span> : actionLabel(e.action)}</td>
                    <td className="small muted">{rolesLabel(e.actorRoles)}</td>
                    <td className="small">{detailSummary(e).join(' · ') || <span className="muted">—</span>}<p className="tiny muted mono">{e.entity} {e.entityId}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span className="small muted num">{page * PAGE + 1}–{Math.min(d.total, (page + 1) * PAGE)} of {d.total.toLocaleString('en-IN')}</span>
            <div className="row-c">
              <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</button>
              <button type="button" className="btn" disabled={(page + 1) * PAGE >= d.total} onClick={() => setPage((p) => p + 1)}>Older</button>
            </div>
          </div>
        </section>
      )}
    </Page>
  );
}
