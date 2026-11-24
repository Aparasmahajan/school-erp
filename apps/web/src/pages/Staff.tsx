import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, roleLabel, type RoleKey } from '@school/core/browser';
import { api, errorText } from '../lib/api';
import { dateTime } from '../lib/format';
import { useMe } from '../lib/session';
import type { StaffMember } from '../lib/types';
import { Icon } from '../components/Icon';
import { Avatar, CopyButton, Empty, Modal, Notice, Page, Spinner } from '../components/ui';

interface Data {
  staff: StaffMember[];
  canManage: boolean;
  canManagePrincipal: boolean;
}

const STAFF_ROLES = ROLES.filter((r) => r.staff);

export function Staff() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['staff'], queryFn: () => api<Data>('/api/staff') });
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);

  const reinvite = useMutation({
    mutationFn: (s: StaffMember) => api<{ inviteUrl: string }>(`/api/staff/${s.id}/invite`, { method: 'POST' }).then((r) => ({ name: s.name, url: r.inviteUrl })),
    onSuccess: setLink,
  });

  return (
    <Page
      title="Staff"
      eyebrow={q.data ? `${q.data.staff.length} people` : ''}
      actions={
        q.data?.canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Invite staff
          </button>
        )
      }
    >
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="bad">{q.error.message}</Notice>}
      {reinvite.error && <Notice tone="bad">{errorText(reinvite.error)}</Notice>}
      {link && (
        <Notice tone="ok">
          <p>
            Send this link to <strong>{link.name}</strong>. It lets them set a password and works for 7 days. (Email and SMS sending aren't set up yet.)
          </p>
          <p className="tiny num" style={{ wordBreak: 'break-all', margin: '8px 0' }}>{link.url}</p>
          <CopyButton text={link.url} />
        </Notice>
      )}
      {q.data && q.data.staff.length === 0 && <Empty>No staff yet.</Empty>}
      {q.data && q.data.staff.length > 0 && (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last sign-in</th>
                  {q.data.canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {q.data.staff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="name-cell">
                        <Avatar name={s.name} />
                        <div>
                          <p className="small strong">{s.name}{s.id === me?.user.id && <span className="muted"> (you)</span>}</p>
                          <p className="tiny muted">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="row-center" style={{ gap: 6 }}>
                        {s.roles.map((r) => <span key={r} className="badge badge-accent">{roleLabel(r)}</span>)}
                        {s.classTeacherOf.length > 0 && <span className="tiny muted">Class teacher of {s.classTeacherOf.join(', ')}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'ACTIVE' ? 'badge-ok' : s.status === 'INVITED' ? 'badge-warn' : 'badge-muted'}`}>
                        {s.status === 'ACTIVE' ? 'Active' : s.status === 'INVITED' ? 'Invite pending' : 'Suspended'}
                      </span>
                    </td>
                    <td className="small muted">{s.lastLoginAt ? dateTime(s.lastLoginAt) : 'Never'}</td>
                    {q.data.canManage && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost" onClick={() => setEditing(s)}>Edit</button>
                        {s.status === 'INVITED' && (
                          <button type="button" className="btn btn-ghost" onClick={() => reinvite.mutate(s)}>New link</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editing && q.data && (
        <StaffForm
          initial={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.user.id}
          canPrincipal={q.data.canManagePrincipal}
          onClose={() => setEditing(null)}
          onInvited={(name, url) => {
            setEditing(null);
            setLink({ name, url });
            void qc.invalidateQueries({ queryKey: ['staff'] });
          }}
        />
      )}
    </Page>
  );
}

function StaffForm({
  initial,
  isSelf,
  canPrincipal,
  onClose,
  onInvited,
}: {
  initial: StaffMember | null;
  isSelf: boolean;
  canPrincipal: boolean;
  onClose: () => void;
  onInvited: (name: string, url: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [roles, setRoles] = useState<RoleKey[]>(initial?.roles ?? ['SUBJECT_TEACHER']);
  const [status, setStatus] = useState(initial?.status ?? 'ACTIVE');

  const save = useMutation({
    mutationFn: async () => {
      if (!initial) return api<{ inviteUrl: string }>('/api/staff', { method: 'POST', body: { name, email, phone, roles } });
      const body: Record<string, unknown> = { name, phone };
      if (!isSelf) {
        body.roles = roles;
        if (initial.status !== 'INVITED') body.status = status;
      }
      await api(`/api/staff/${initial.id}`, { method: 'PATCH', body });
      return null;
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
      if (res) onInvited(name, res.inviteUrl);
      else onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Invite a member of staff'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {save.error && <Notice tone="bad">{save.error.message}</Notice>}
        <div className="form-grid">
          <label className="field">Full name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!initial} required /></label>
          <label className="field">Phone<input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }} disabled={isSelf}>
          <legend className="small strong" style={{ marginBottom: 6 }}>Roles{isSelf && <span className="muted"> (you can't change your own)</span>}</legend>
          {STAFF_ROLES.map((r) => {
            const locked = r.key === 'PRINCIPAL' && !canPrincipal;
            return (
              <label key={r.key} className="check" style={{ opacity: locked ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={roles.includes(r.key)}
                  disabled={locked}
                  onChange={(e) => setRoles((rs) => (e.target.checked ? [...rs, r.key] : rs.filter((x) => x !== r.key)))}
                />
                {r.label}
              </label>
            );
          })}
        </fieldset>
        {initial && initial.status !== 'INVITED' && !isSelf && (
          <label className="field">
            Account
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended (signs out at once)</option>
            </select>
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending || roles.length === 0}>{save.isPending ? 'Saving…' : initial ? 'Save' : 'Create invite link'}</button>
        </div>
      </form>
    </Modal>
  );
}
