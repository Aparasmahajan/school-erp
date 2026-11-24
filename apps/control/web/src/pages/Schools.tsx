import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ago, n } from '../lib/format';
import { useIsOwner } from '../lib/session';
import type { School, SchoolStatus } from '../lib/types';
import { HealthBadge, StatusBadge } from '../components/Health';
import { Icon } from '../components/Icon';
import { Empty, Modal, Notice, Page, SecretBlock, Spinner } from '../components/ui';

export function Schools() {
  const owner = useIsOwner();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SchoolStatus | ''>('');
  const [onboarding, setOnboarding] = useState(false);
  const list = useQuery({ queryKey: ['schools'], queryFn: () => api<{ schools: School[]; latestVersion: string }>('/api/schools') });

  const rows = (list.data?.schools ?? []).filter(
    (s) =>
      (!status || s.status === status) &&
      (!q || [s.name, s.code, s.city, s.board, s.contactName].join(' ').toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Page
      eyebrow={list.data ? `${list.data.schools.length} on the register · newest version ${list.data.latestVersion || '—'}` : ''}
      title="Schools"
      actions={owner && <button type="button" className="btn btn-primary" onClick={() => setOnboarding(true)}><Icon name="plus" size={18} /> Onboard a school</button>}
    >
      <div className="row">
        <label className="field grow">Search<input className="input" type="search" placeholder="Name, code, city or contact" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field">
          Stage
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as SchoolStatus | '')}>
            <option value="">All</option>
            <option value="ONBOARDING">Onboarding</option>
            <option value="LIVE">Live</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="OFFBOARDED">Offboarded</option>
          </select>
        </label>
      </div>
      {list.isPending && <Spinner />}
      {list.error && <Notice tone="alert">{list.error.message}</Notice>}
      {list.data && rows.length === 0 && <Empty>No schools match.</Empty>}
      {rows.length > 0 && (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th scope="col">School</th><th scope="col">Place</th><th scope="col">Stage</th><th scope="col">Health</th>
                  <th scope="col">Last report</th><th scope="col">Version</th><th scope="col">Students</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="click" onClick={() => navigate(`/schools/${s.id}`)}>
                    <td>
                      <a href={`/schools/${s.id}`} onClick={(e) => { e.preventDefault(); navigate(`/schools/${s.id}`); }} className="strong" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{s.name}</a>
                      <p className="tiny muted mono">{s.code}</p>
                    </td>
                    <td><p>{s.city || '—'}</p><p className="tiny muted">{s.board}</p></td>
                    <td><StatusBadge status={s.status} /></td>
                    <td><HealthBadge health={s.health} /></td>
                    <td className="small">{s.lastSeenAt ? ago(s.lastSeenAt) : <span className="muted">never</span>}</td>
                    <td className="num small">{s.appVersion || '—'}</td>
                    <td className="num">{n(s.snapshot?.students)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {onboarding && <OnboardModal onClose={() => setOnboarding(false)} onOpen={(id) => navigate(`/schools/${id}`)} />}
    </Page>
  );
}

const BLANK = { name: '', code: '', city: '', board: '', contactName: '', contactEmail: '', contactPhone: '', appUrl: '', plan: 'Standard', notes: '' };

export function SchoolFields({ form, set, withCode }: { form: typeof BLANK; set: (k: keyof typeof BLANK, v: string) => void; withCode: boolean }) {
  const f = (k: keyof typeof BLANK) => ({ value: form[k], onChange: (e: { target: { value: string } }) => set(k, e.target.value) });
  return (
    <div className="form-grid">
      <label className="field">School name<input className="input" {...f('name')} required /></label>
      {withCode && <label className="field">Code <span className="hint">Short and unique, e.g. SUNRISE-JPR</span><input className="input mono" {...f('code')} required /></label>}
      <label className="field">City<input className="input" {...f('city')} /></label>
      <label className="field">Board<input className="input" list="boards" {...f('board')} /><datalist id="boards"><option value="CBSE" /><option value="ICSE" /><option value="State board" /><option value="IB" /><option value="Cambridge" /></datalist></label>
      <label className="field">Contact person<input className="input" {...f('contactName')} /></label>
      <label className="field">Contact email<input className="input" type="email" {...f('contactEmail')} /></label>
      <label className="field">Contact phone<input className="input" type="tel" {...f('contactPhone')} /></label>
      <label className="field">School app address<input className="input" type="url" placeholder="https://erp.school.in" {...f('appUrl')} /></label>
      <label className="field">Plan<input className="input" {...f('plan')} /></label>
      <label className="field" style={{ gridColumn: '1 / -1' }}>Notes<textarea className="textarea" {...f('notes')} /></label>
    </div>
  );
}

function OnboardModal({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const save = useMutation({
    mutationFn: () => api<{ school: School; installKey: string; env: string }>('/api/schools', { method: 'POST', body: form }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schools'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
  const done = save.data;

  return (
    <Modal title={done ? `${done.school.name} is on the register` : 'Onboard a school'} onClose={done ? () => onOpen(done.school.id) : onClose}>
      {!done ? (
        <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          {save.error && <Notice tone="alert">{save.error.message}</Notice>}
          <p className="small muted">This creates the school's record and its install key. The school's own data stays on its own server.</p>
          <SchoolFields form={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} withCode />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Creating…' : 'Create and get install key'}</button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <Notice tone="watch">
            <strong>Copy this now.</strong> The install key is shown only once; only a fingerprint of it is kept. If it's lost, issue a new one from the school's page.
          </Notice>
          <p className="small">Add these three lines to the school server's <span className="mono">apps/api/.env</span> and restart it. The school will appear as live within a few minutes.</p>
          <SecretBlock text={done.env} label="Copy settings" />
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => onOpen(done.school.id)}>Open the school's page</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
