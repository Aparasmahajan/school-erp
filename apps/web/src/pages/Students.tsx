import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { pct } from '../lib/format';
import type { ClassInfo, Guardian, StudentDetail, StudentListItem } from '../lib/types';
import { Icon } from '../components/Icon';
import { Avatar, Empty, Modal, Notice, Page, Spinner } from '../components/ui';

const PAGE_SIZE = 25;

export function Students() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'LEFT' | 'ALL'>('ACTIVE');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<StudentDetail | 'new' | null>(null);
  const selected = params.get('open') ?? '';
  const search = useDeferredValue(q);

  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api<{ classes: ClassInfo[] }>('/api/classes') });
  const sections = useMemo(() => (classes.data?.classes ?? []).flatMap((c) => c.sections), [classes.data]);
  const viewable = sections.filter((s) => s.canViewStudents);
  const editable = sections.filter((s) => s.canEditStudents);

  const list = useQuery({
    queryKey: ['students', search, sectionId, status],
    queryFn: () =>
      api<{ students: StudentListItem[] }>(
        `/api/students?${new URLSearchParams({ q: search, sectionId, status }).toString()}`
      ),
    placeholderData: (prev) => prev,
  });

  const rows = list.data?.students ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const open = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: true });
  };

  return (
    <Page
      eyebrow={list.data ? `${rows.length} ${status === 'LEFT' ? 'who have left' : 'students'}` : ''}
      title="Students"
      actions={
        editable.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Add student
          </button>
        )
      }
    >
      <div className="row">
        <label className="field grow">
          Search
          <input className="input" type="search" placeholder="Name, admission number, guardian or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </label>
        <label className="field">
          Section
          <select className="select" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(0); }}>
            <option value="">All I can see</option>
            {viewable.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}>
            <option value="ACTIVE">Current</option>
            <option value="LEFT">Left school</option>
            <option value="ALL">Everyone</option>
          </select>
        </label>
      </div>

      <div className="split">
        <section className="card card-flush wide" aria-label="Students">
          {list.isPending && <div style={{ padding: 16 }}><Spinner /></div>}
          {list.error && <div style={{ padding: 16 }}><Notice tone="bad">{list.error.message}</Notice></div>}
          {list.data && rows.length === 0 && <Empty>No students match.</Empty>}
          {shown.length > 0 && (
            <>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Class · Roll</th>
                      <th scope="col">Guardian</th>
                      <th scope="col">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s.id} className={`clickable${s.id === selected ? ' selected' : ''}`} onClick={() => open(s.id)}>
                        <td>
                          <div className="name-cell">
                            <Avatar name={s.name} />
                            <div>
                              <button type="button" className="link-btn" style={{ minHeight: 0, fontSize: 14, color: 'var(--text)' }} onClick={(e) => { e.stopPropagation(); open(s.id); }}>
                                {s.name}
                              </button>
                              <p className="tiny muted num">Adm {s.admissionNo}{s.status === 'LEFT' && ' · left'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="num">{s.sectionLabel} · {s.rollNo ?? '–'}</td>
                        <td>
                          <p className="small">{s.guardianName || '—'}</p>
                          <p className="tiny muted num">{s.guardianPhone}</p>
                        </td>
                        <td>
                          <div className="row-center">
                            <span className="num small strong" style={{ width: 48, color: (s.attendancePct ?? 100) < 80 ? 'var(--bad-text)' : (s.attendancePct ?? 100) < 90 ? 'var(--warn-text)' : undefined }}>
                              {pct(s.attendancePct)}
                            </span>
                            <span className="meter" aria-hidden="true"><span style={{ width: `${s.attendancePct ?? 0}%` }} /></span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                <span className="small muted num">
                  {page * PAGE_SIZE + 1}–{Math.min(rows.length, (page + 1) * PAGE_SIZE)} of {rows.length}
                </span>
                <div className="row-center">
                  <button type="button" className="btn btn-icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <Icon name="chevronLeft" label="Previous page" />
                  </button>
                  <button type="button" className="btn btn-icon" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                    <Icon name="chevronRight" label="Next page" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {selected && <Profile id={selected} onClose={() => open('')} onEdit={(s) => setEditing(s)} />}
      </div>

      {editing && (
        <StudentForm
          initial={editing === 'new' ? null : editing}
          sections={editing === 'new' ? editable : sections.filter((s) => s.canEditStudents || s.id === editing.sectionId)}
          onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); open(id); }}
        />
      )}
    </Page>
  );
}

function Profile({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (s: StudentDetail) => void }) {
  const q = useQuery({ queryKey: ['student', id], queryFn: () => api<{ student: StudentDetail }>(`/api/students/${id}`) });
  const s = q.data?.student;
  return (
    <aside className="narrow">
      <section className="card stack" aria-label="Student profile">
        {q.isPending && <Spinner />}
        {q.error && <Notice tone="bad">{q.error.message}</Notice>}
        {s && (
          <>
            <div className="row-center" style={{ alignItems: 'flex-start' }}>
              <Avatar name={s.name} large />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800 }}>{s.name}</h2>
                <p className="small muted num">{s.sectionLabel} · Roll {s.rollNo ?? '–'} · Adm {s.admissionNo}</p>
                <span className={`badge ${s.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`} style={{ marginTop: 8 }}>
                  {s.status === 'ACTIVE' ? 'Current' : 'Left school'}
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}>
                <Icon name="close" label="Close profile" />
              </button>
            </div>

            <div className="tally">
              <div>
                <p>Attendance this year</p>
                <p>{pct(s.attendance.pct)}</p>
              </div>
              <div className={s.attendance.absent > 5 ? 'bad' : ''}>
                <p>Days absent</p>
                <p>{s.attendance.absent}</p>
              </div>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <h3 className="tiny strong muted" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Guardians</h3>
              {s.guardians.length === 0 && <p className="small muted">None on file.</p>}
              {s.guardians.map((g) => (
                <div key={g.id} className="row-center">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="small strong">
                      {g.name} <span className="muted" style={{ fontWeight: 500 }}>· {g.relation}{g.isPrimary && ' · main contact'}</span>
                    </p>
                    <p className="small muted num">{g.phone || 'No phone'}</p>
                  </div>
                  {g.phone && (
                    <a className="btn btn-icon" href={`tel:${g.phone.replace(/[^\d+]/g, '')}`}>
                      <Icon name="phone" size={18} label={`Call ${g.name}`} />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14 }}>
              <dt className="muted">Date of birth</dt>
              <dd style={{ margin: 0 }} className="num">{s.dob || '—'}</dd>
              <dt className="muted">Gender</dt>
              <dd style={{ margin: 0 }}>{{ M: 'Male', F: 'Female', O: 'Other' }[s.gender] ?? '—'}</dd>
              <dt className="muted">Joined</dt>
              <dd style={{ margin: 0 }} className="num">{s.joinedOn || '—'}</dd>
            </dl>

            {s.canEdit && (
              <button type="button" className="btn" onClick={() => onEdit(s)}>
                Edit details
              </button>
            )}
          </>
        )}
      </section>
    </aside>
  );
}

const BLANK_GUARDIAN: Guardian = { name: '', relation: 'Father', phone: '', email: '', isPrimary: true };

function StudentForm({
  initial,
  sections,
  onClose,
  onSaved,
}: {
  initial: StudentDetail | null;
  sections: { id: string; label: string }[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    admissionNo: initial?.admissionNo ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    gender: initial?.gender ?? '',
    dob: initial?.dob ?? '',
    sectionId: initial?.sectionId ?? sections[0]?.id ?? '',
    rollNo: initial?.rollNo != null ? String(initial.rollNo) : '',
    status: initial?.status ?? 'ACTIVE',
  });
  const [guardians, setGuardians] = useState<Guardian[]>(initial?.guardians.length ? initial.guardians : [{ ...BLANK_GUARDIAN }]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setG = (i: number, k: keyof Guardian, v: string | boolean) =>
    setGuardians((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : k === 'isPrimary' && v ? { ...g, isPrimary: false } : g)));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        admissionNo: form.admissionNo,
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender as 'M' | 'F' | 'O' | '',
        dob: form.dob,
        sectionId: form.sectionId,
        rollNo: form.rollNo ? Number(form.rollNo) : null,
        guardians: guardians.filter((g) => g.name.trim()),
      };
      if (!initial) return (await api<{ id: string }>('/api/students', { method: 'POST', body })).id;
      await api(`/api/students/${initial.id}`, { method: 'PATCH', body: { ...body, status: form.status } });
      return initial.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['students'] });
      void qc.invalidateQueries({ queryKey: ['student', id] });
      onSaved(id);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add a student'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {save.error && <Notice tone="bad">{save.error.message}</Notice>}
        <div className="form-grid">
          <label className="field">First name<input className="input" value={form.firstName} onChange={set('firstName')} required /></label>
          <label className="field">Last name<input className="input" value={form.lastName} onChange={set('lastName')} /></label>
          <label className="field">Admission number<input className="input" value={form.admissionNo} onChange={set('admissionNo')} required /></label>
          <label className="field">
            Section
            <select className="select" value={form.sectionId} onChange={set('sectionId')} required>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Roll number<input className="input" type="number" min={1} max={999} value={form.rollNo} onChange={set('rollNo')} /></label>
          <label className="field">
            Gender
            <select className="select" value={form.gender} onChange={set('gender')}>
              <option value="">Not given</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
            </select>
          </label>
          <label className="field">Date of birth<input className="input" type="date" value={form.dob} onChange={set('dob')} /></label>
          {initial && (
            <label className="field">
              Status
              <select className="select" value={form.status} onChange={set('status')}>
                <option value="ACTIVE">Current</option><option value="LEFT">Left school</option>
              </select>
            </label>
          )}
        </div>

        <h3 className="small strong">Guardians</h3>
        {guardians.map((g, i) => (
          <fieldset key={i} className="form-grid" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, margin: 0 }}>
            <legend className="tiny muted strong">Guardian {i + 1}</legend>
            <label className="field">Name<input className="input" value={g.name} onChange={(e) => setG(i, 'name', e.target.value)} required={i === 0} /></label>
            <label className="field">
              Relation
              <select className="select" value={g.relation} onChange={(e) => setG(i, 'relation', e.target.value)}>
                {['Father', 'Mother', 'Guardian', 'Grandparent', 'Other'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">Phone<input className="input" type="tel" value={g.phone} onChange={(e) => setG(i, 'phone', e.target.value)} /></label>
            <label className="check"><input type="radio" name="primary" checked={g.isPrimary} onChange={() => setG(i, 'isPrimary', true)} /> Main contact</label>
          </fieldset>
        ))}
        {guardians.length < 4 && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setGuardians((gs) => [...gs, { ...BLANK_GUARDIAN, relation: 'Mother', isPrimary: false }])}>
            <Icon name="plus" size={18} /> Another guardian
          </button>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Add student'}</button>
        </div>
      </form>
    </Modal>
  );
}
