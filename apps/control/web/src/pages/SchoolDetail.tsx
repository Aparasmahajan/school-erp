import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../lib/api';
import { ago, n, pct, when } from '../lib/format';
import { actionLabel, detailSummary, rolesLabel } from '../lib/labels';
import { useIsOwner, useMe } from '../lib/session';
import type { HeartbeatPoint, School, SchoolStatus, TrailEvent } from '../lib/types';
import { HealthBadge, StatusBadge } from '../components/Health';
import { Icon } from '../components/Icon';
import { Empty, Modal, Notice, Page, SecretBlock, Spinner } from '../components/ui';
import { SchoolFields } from './Schools';

interface Data {
  school: School;
  heartbeats: HeartbeatPoint[];
  events: TrailEvent[];
}

export function SchoolDetail() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['school', id], queryFn: () => api<Data>(`/api/schools/${id}`), refetchInterval: 60_000 });
  const s = q.data?.school;
  const owner = useIsOwner();
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);

  return (
    <Page
      eyebrow={s ? <span className="mono">{[s.code, s.city, s.board].filter(Boolean).join(' · ')}</span> : ''}
      title={s?.name ?? 'School'}
      actions={
        s && owner && (
          <div className="row-c">
            <button type="button" className="btn" onClick={() => setEditing(true)}>Edit details</button>
            <button type="button" className="btn" onClick={() => setRotating(true)}><Icon name="key" size={18} /> New install key</button>
          </div>
        )
      }
    >
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="alert">{q.error.message}</Notice>}
      {q.data && s && (
        <div className="split">
          <div className="wide">
            <HealthNow s={s} />
            <History points={q.data.heartbeats} />
            <RecentTrail events={q.data.events} schoolId={s.id} />
          </div>
          <div className="narrow">
            <Lifecycle s={s} owner={owner} />
            <Profile s={s} />
            <section className="card stack">
              <h2>Install key</h2>
              <p className="small">Starts with <span className="mono">{s.keyPrefix}…</span></p>
              <p className="tiny muted">Issued {s.keyRotatedAt ? ago(s.keyRotatedAt) : '—'}. Only a fingerprint is stored here.</p>
            </section>
          </div>
        </div>
      )}
      {editing && s && <EditModal s={s} onClose={() => setEditing(false)} />}
      {rotating && s && <RotateModal s={s} onClose={() => setRotating(false)} />}
    </Page>
  );
}

function HealthNow({ s }: { s: School }) {
  const snap = s.snapshot;
  return (
    <section className="card stack" aria-labelledby="now">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 id="now">Right now</h2>
        <HealthBadge health={s.health} />
      </div>
      {s.issues.length > 0 && s.health !== 'paused' ? (
        <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)' }}>
          {s.issues.map((i) => <li key={i}>{i}</li>)}
        </ul>
      ) : s.health === 'live' ? (
        <p className="small muted">Reporting normally.</p>
      ) : null}
      {snap ? (
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', rowGap: 16 }}>
          <div><p>Students</p><p>{n(snap.students)}</p></div>
          <div><p>Staff</p><p>{n(snap.staff)}</p></div>
          <div><p>Staff in today</p><p>{n(snap.staffCheckedIn)}</p></div>
          <div><p>Sections marked</p><p>{snap.sections ? `${snap.sectionsMarked ?? 0} / ${snap.sections}` : '—'}</p></div>
          <div><p>Present today</p><p>{pct(snap.presentPct)}</p></div>
          <div><p>Waiting to send</p><p>{n(snap.queued)}</p></div>
          <div><p>Version</p><p>{snap.appVersion ?? '—'}</p></div>
          <div><p>Storage</p><p>{snap.storage === 'sheets' ? 'Google Sheets' : snap.storage === 'file' ? 'Local file' : snap.storage ?? '—'}</p></div>
          <div><p>Last report</p><p>{ago(s.lastSeenAt)}</p></div>
        </div>
      ) : (
        <p className="small muted">No report yet. Once the school's server has its install key it reports within a few minutes.</p>
      )}
    </section>
  );
}

function Sparkline({ values, label, suffix = '' }: { values: (number | null)[]; label: string; suffix?: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return <p className="small muted">{label}: not enough history yet.</p>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * 300;
  const y = (v: number) => 54 - ((v - min) / span) * 46;
  const line = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1].v;
  return (
    <figure style={{ margin: 0 }} className="stack">
      <figcaption className="row-c" style={{ justifyContent: 'space-between' }}>
        <span className="small strong">{label}</span>
        <span className="tiny muted num">low {min}{suffix} · high {max}{suffix} · now <strong style={{ color: 'var(--ink)' }}>{last}{suffix}</strong></span>
      </figcaption>
      <svg viewBox="0 0 300 60" preserveAspectRatio="none" style={{ width: '100%', height: 70 }} role="img" aria-label={`${label}: between ${min}${suffix} and ${max}${suffix}, now ${last}${suffix}`}>
        <polygon points={`${x(pts[0].i)},60 ${line} ${x(pts[pts.length - 1].i)},60`} fill="var(--ok-soft)" />
        <polyline points={line} fill="none" stroke="var(--ok)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </figure>
  );
}

function History({ points }: { points: HeartbeatPoint[] }) {
  return (
    <section className="card stack" aria-labelledby="hist">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 id="hist">Recent days</h2>
        <span className="tiny muted">{points.length} hourly reports</span>
      </div>
      <Sparkline label="Students present" values={points.map((p) => p.presentPct)} suffix="%" />
      <Sparkline label="Staff checked in" values={points.map((p) => p.staffCheckedIn)} />
    </section>
  );
}

function RecentTrail({ events, schoolId }: { events: TrailEvent[]; schoolId: string }) {
  const tz = useMe().data?.displayTimezone ?? 'Asia/Kolkata';
  return (
    <section className="card card-flush" aria-labelledby="trail">
      <div className="card-head" style={{ padding: '16px 20px 0' }}>
        <h2 id="trail">Latest activity</h2>
        <Link to={`/trail?schoolId=${schoolId}`} className="small strong">Full trail →</Link>
      </div>
      {events.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 560 }}>
            <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">By</th><th scope="col">Details</th></tr></thead>
            <tbody>
              {events.slice(0, 15).map((e) => (
                <tr key={e.id}>
                  <td className="small num" style={{ whiteSpace: 'nowrap' }}>{when(e.at, tz)}</td>
                  <td>{e.kind === 'error' ? <span className="badge tone-alert">{actionLabel(e.action)}</span> : actionLabel(e.action)}</td>
                  <td className="small muted">{rolesLabel(e.actorRoles)}</td>
                  <td className="small">{detailSummary(e).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Lifecycle({ s, owner }: { s: School; owner: boolean }) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (status: SchoolStatus) => api(`/api/schools/${s.id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['school', s.id] });
      void qc.invalidateQueries({ queryKey: ['schools'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
  const ask = (status: SchoolStatus, message: string) => window.confirm(message) && change.mutate(status);
  return (
    <section className="card stack">
      <div className="row-c" style={{ justifyContent: 'space-between' }}><h2>Stage</h2><StatusBadge status={s.status} /></div>
      <p className="tiny muted">{s.onboardedAt ? `Live since ${new Date(s.onboardedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Becomes live automatically with its first report.'}</p>
      {change.error && <Notice tone="alert">{errorText(change.error)}</Notice>}
      {owner && (
        <div className="row-c">
          {s.status === 'SUSPENDED' && <button type="button" className="btn" onClick={() => change.mutate('LIVE')}>Resume</button>}
          {(s.status === 'LIVE' || s.status === 'ONBOARDING') && (
            <button type="button" className="btn" onClick={() => ask('SUSPENDED', `Suspend ${s.name}? It keeps reporting, but shows as paused here.`)}>Suspend</button>
          )}
          {s.status !== 'OFFBOARDED' && (
            <button type="button" className="btn btn-danger" onClick={() => ask('OFFBOARDED', `Offboard ${s.name}? Its key stops working at once. Its history stays on the register.`)}>Offboard</button>
          )}
        </div>
      )}
    </section>
  );
}

function Profile({ s }: { s: School }) {
  return (
    <section className="card stack">
      <h2>Details</h2>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 15 }}>
        <dt className="muted">Contact</dt><dd style={{ margin: 0 }}>{s.contactName || '—'}</dd>
        <dt className="muted">Email</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{s.contactEmail ? <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a> : '—'}</dd>
        <dt className="muted">Phone</dt><dd style={{ margin: 0 }}>{s.contactPhone ? <a href={`tel:${s.contactPhone.replace(/[^\d+]/g, '')}`}>{s.contactPhone}</a> : '—'}</dd>
        <dt className="muted">School app</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{s.appUrl ? <a href={s.appUrl} target="_blank" rel="noreferrer">{s.appUrl.replace(/^https?:\/\//, '')}</a> : '—'}</dd>
        <dt className="muted">Plan</dt><dd style={{ margin: 0 }}>{s.plan || '—'}</dd>
        <dt className="muted">On register</dt><dd style={{ margin: 0 }}>{ago(s.createdAt)}</dd>
      </dl>
      {s.notes && <p className="small" style={{ whiteSpace: 'pre-wrap', borderTop: '1px solid var(--line)', paddingTop: 12 }}>{s.notes}</p>}
    </section>
  );
}

function EditModal({ s, onClose }: { s: School; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: s.name, code: s.code, city: s.city, board: s.board, contactName: s.contactName, contactEmail: s.contactEmail, contactPhone: s.contactPhone, appUrl: s.appUrl, plan: s.plan, notes: s.notes });
  const save = useMutation({
    mutationFn: () => {
      const { code: _c, ...body } = form;
      return api(`/api/schools/${s.id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['school', s.id] });
      void qc.invalidateQueries({ queryKey: ['schools'] });
      onClose();
    },
  });
  return (
    <Modal title={`Edit ${s.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        {save.error && <Notice tone="alert">{save.error.message}</Notice>}
        <SchoolFields form={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} withCode={false} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RotateModal({ s, onClose }: { s: School; onClose: () => void }) {
  const qc = useQueryClient();
  const rotate = useMutation({
    mutationFn: () => api<{ installKey: string; env: string }>(`/api/schools/${s.id}/rotate-key`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['school', s.id] }),
  });
  return (
    <Modal title="New install key" onClose={onClose}>
      {!rotate.data ? (
        <div className="stack">
          {rotate.error && <Notice tone="alert">{rotate.error.message}</Notice>}
          <p>The current key stops working the moment you do this. {s.name} won't be able to report until its server has the new key.</p>
          <p className="small muted">Do this if the key may have leaked, or to bring back an offboarded school.</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={rotate.isPending} onClick={() => rotate.mutate()}>{rotate.isPending ? 'Issuing…' : 'Issue a new key'}</button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <Notice tone="watch"><strong>Copy this now.</strong> It is shown only once.</Notice>
          <p className="small">Replace these lines in the school server's <span className="mono">apps/api/.env</span>, then restart it.</p>
          <SecretBlock text={rotate.data.env} label="Copy settings" />
          <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
        </div>
      )}
    </Modal>
  );
}
