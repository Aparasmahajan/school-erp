import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../lib/api';
import { ago, when } from '../lib/format';
import { actionLabel } from '../lib/labels';
import { useMe } from '../lib/session';
import type { Admin } from '../lib/types';
import { Icon } from '../components/Icon';
import { Empty, Modal, Notice, Page, SecretBlock, Spinner } from '../components/ui';

/** People who can open this console. Owners change things; viewers only look. */
export function Team() {
  const me = useMe().data?.admin;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admins'], queryFn: () => api<{ admins: Admin[] }>('/api/admins') });
  const [editing, setEditing] = useState<Admin | 'new' | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const relink = useMutation({
    mutationFn: (a: Admin) => api<{ inviteUrl: string }>(`/api/admins/${a.id}/invite`, { method: 'POST' }).then((r) => ({ name: a.name, url: r.inviteUrl })),
    onSuccess: setLink,
  });

  return (
    <Page
      eyebrow="Who can open this console"
      title="Console team"
      actions={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Invite someone</button>}
    >
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="alert">{q.error.message}</Notice>}
      {relink.error && <Notice tone="alert">{errorText(relink.error)}</Notice>}
      {link && (
        <div className="card stack">
          <p>Send this link to <strong>{link.name}</strong>. It works once, for 7 days.</p>
          <SecretBlock text={link.url} label="Copy link" />
        </div>
      )}
      {q.data && (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Account</th><th scope="col">Last sign-in</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {q.data.admins.map((a) => (
                  <tr key={a.id}>
                    <td><p className="strong">{a.name}{a.id === me?.id && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</p><p className="tiny muted">{a.email}</p></td>
                    <td><span className={`badge ${a.role === 'OWNER' ? 'tone-brand' : 'tone-rest'}`}>{a.role === 'OWNER' ? 'Owner' : 'Viewer'}</span></td>
                    <td><span className={`badge ${a.status === 'ACTIVE' ? 'tone-ok' : a.status === 'INVITED' ? 'tone-watch' : 'tone-rest'}`}>{a.status === 'ACTIVE' ? 'Active' : a.status === 'INVITED' ? 'Invite pending' : 'Suspended'}</span></td>
                    <td className="small">{a.lastLoginAt ? ago(a.lastLoginAt) : <span className="muted">never</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {a.id !== me?.id && <button type="button" className="btn btn-ghost" onClick={() => setEditing(a)}>Edit</button>}
                      {a.status === 'INVITED' && <button type="button" className="btn btn-ghost" onClick={() => relink.mutate(a)}>New link</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editing && (
        <AdminForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onInvited={(name, url) => {
            setEditing(null);
            setLink({ name, url });
            void qc.invalidateQueries({ queryKey: ['admins'] });
          }}
        />
      )}
    </Page>
  );
}

function AdminForm({ initial, onClose, onInvited }: { initial: Admin | null; onClose: () => void; onInvited: (name: string, url: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<Admin['role']>(initial?.role ?? 'VIEWER');
  const [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: async () => {
      if (!initial) return api<{ inviteUrl: string }>('/api/admins', { method: 'POST', body: { name, email, role } });
      await api(`/api/admins/${initial.id}`, { method: 'PATCH', body: { name, role, ...(initial.status !== 'INVITED' ? { status } : {}) } });
      return null;
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admins'] });
      if (res) onInvited(name, res.inviteUrl);
      else onClose();
    },
  });
  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Invite to the console'} onClose={onClose}>
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        {save.error && <Notice tone="alert">{save.error.message}</Notice>}
        <div className="form-grid">
          <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!initial} required /></label>
          <label className="field">
            Role
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Admin['role'])}>
              <option value="VIEWER">Viewer: can look at everything, change nothing</option>
              <option value="OWNER">Owner: can onboard schools, issue keys, manage this team</option>
            </select>
          </label>
          {initial && initial.status !== 'INVITED' && (
            <label className="field">
              Account
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Admin['status'])}>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended (signed out at once)</option>
              </select>
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : initial ? 'Save' : 'Create invite link'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** What console users did. */
export function ConsoleLog() {
  const tz = useMe().data?.displayTimezone ?? 'Asia/Kolkata';
  const q = useQuery({
    queryKey: ['console-log'],
    queryFn: () => api<{ activity: { id: string; at: string; action: string; adminName: string; entity: string; entityName: string }[] }>('/api/admins/activity'),
  });
  return (
    <Page eyebrow="Everything done in this console" title="Console log">
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="alert">{q.error.message}</Notice>}
      {q.data && q.data.activity.length === 0 && <Empty>Nothing yet.</Empty>}
      {q.data && q.data.activity.length > 0 && (
        <section className="card card-flush">
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">On</th></tr></thead>
              <tbody>
                {q.data.activity.map((a) => (
                  <tr key={a.id}>
                    <td className="small num" style={{ whiteSpace: 'nowrap' }}>{when(a.at, tz)}</td>
                    <td className="strong small">{a.adminName}</td>
                    <td>{actionLabel(a.action)}</td>
                    <td className="small">{a.entityName}</td>
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
