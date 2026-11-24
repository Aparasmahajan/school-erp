import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../lib/api';
import type { ClassInfo, SectionInfo, StaffMember } from '../lib/types';
import { Icon } from '../components/Icon';
import { Empty, Notice, Page, Spinner } from '../components/ui';

export function Classes() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api<{ classes: ClassInfo[] }>('/api/classes') });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<{ staff: StaffMember[] }>('/api/staff') });
  const teachers = (staff.data?.staff ?? []).filter((s) => s.status !== 'SUSPENDED');
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [newClass, setNewClass] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['classes'] });
    void qc.invalidateQueries({ queryKey: ['staff'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };
  const report = (res: { warning?: string; roleAdded?: boolean }, done: string) =>
    setMessage(res.warning ? { tone: 'warn', text: res.warning } : { tone: 'ok', text: res.roleAdded ? `${done} They now have the role they need.` : done });

  const addClass = useMutation({
    mutationFn: () => api('/api/classes', { method: 'POST', body: { name: newClass.trim(), sortOrder: Number(newClass.match(/\d+/)?.[0]) || null } }),
    onSuccess: () => {
      setNewClass('');
      setMessage({ tone: 'ok', text: 'Class added. Add its sections next.' });
      refresh();
    },
    onError: (err) => setMessage({ tone: 'bad', text: errorText(err) }),
  });

  return (
    <Page eyebrow="Academics" title="Classes & sections">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <form
        className="row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (newClass.trim()) addClass.mutate();
        }}
      >
        <label className="field">
          New class
          <input className="input" placeholder="e.g. Class 11 or Nursery" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
        </label>
        <button className="btn" disabled={!newClass.trim() || addClass.isPending}>
          <Icon name="plus" size={18} /> Add class
        </button>
      </form>

      {classes.isPending && <Spinner />}
      {classes.error && <Notice tone="bad">{classes.error.message}</Notice>}
      {classes.data?.classes.length === 0 && <Empty>No classes yet.</Empty>}
      {classes.data?.classes.map((cls) => (
        <section key={cls.id} className="card card-flush">
          <div className="row-center" style={{ justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <h2>{cls.name}</h2>
            <AddSection classId={cls.id} onDone={(res) => { report(res, 'Section added.'); refresh(); }} onError={(t) => setMessage({ tone: 'bad', text: t })} />
          </div>
          {cls.sections.length === 0 && <Empty>No sections yet.</Empty>}
          {cls.sections.length > 0 && (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th scope="col">Section</th>
                    <th scope="col">Class teacher</th>
                    <th scope="col">Students</th>
                    <th scope="col">Subject teachers</th>
                  </tr>
                </thead>
                <tbody>
                  {cls.sections.map((s) => (
                    <SectionRow
                      key={s.id}
                      section={s}
                      teachers={teachers}
                      onDone={(res, text) => { report(res, text); refresh(); }}
                      onError={(t) => setMessage({ tone: 'bad', text: t })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </Page>
  );
}

type Result = { warning?: string; roleAdded?: boolean };

function AddSection({ classId, onDone, onError }: { classId: string; onDone: (r: Result) => void; onError: (t: string) => void }) {
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api<Result>('/api/classes/sections', { method: 'POST', body: { classId, name: name.trim() } }),
    onSuccess: (r) => {
      setName('');
      onDone(r);
    },
    onError: (err) => onError(errorText(err)),
  });
  return (
    <form className="row-center" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
      <label className="sr-only" htmlFor={`sec-${classId}`}>New section name</label>
      <input id={`sec-${classId}`} className="input" style={{ width: 120 }} placeholder="Section, e.g. D" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn" disabled={!name.trim() || add.isPending}>Add section</button>
    </form>
  );
}

function SectionRow({
  section: s,
  teachers,
  onDone,
  onError,
}: {
  section: SectionInfo;
  teachers: StaffMember[];
  onDone: (r: Result, text: string) => void;
  onError: (t: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const setClassTeacher = useMutation({
    mutationFn: (classTeacherId: string) => api<Result>(`/api/classes/sections/${s.id}`, { method: 'PATCH', body: { classTeacherId } }),
    onSuccess: (r) => onDone(r, `Class teacher for ${s.label} updated.`),
    onError: (err) => onError(errorText(err)),
  });
  const addTeaching = useMutation({
    mutationFn: () => api<Result>('/api/classes/teaching', { method: 'POST', body: { userId: teacherId, sectionId: s.id, subject: subject.trim() } }),
    onSuccess: (r) => {
      setSubject('');
      setTeacherId('');
      onDone(r, `Subject teacher added to ${s.label}.`);
    },
    onError: (err) => onError(errorText(err)),
  });
  const removeTeaching = useMutation({
    mutationFn: (id: string) => api(`/api/classes/teaching/${id}`, { method: 'DELETE' }),
    onSuccess: () => onDone({}, `Subject teacher removed from ${s.label}.`),
    onError: (err) => onError(errorText(err)),
  });

  return (
    <tr>
      <td className="strong">{s.label}</td>
      <td>
        <label className="sr-only" htmlFor={`ct-${s.id}`}>Class teacher for {s.label}</label>
        <select id={`ct-${s.id}`} className="select" value={s.classTeacherId} disabled={setClassTeacher.isPending} onChange={(e) => setClassTeacher.mutate(e.target.value)}>
          <option value="">Not assigned</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className="num">{s.studentCount}</td>
      <td>
        <div className="stack" style={{ gap: 6 }}>
          {s.teachers.map((t) => (
            <span key={t.id} className="row-center" style={{ gap: 6 }}>
              <span className="badge badge-muted">{t.subject}</span>
              <span className="small">{t.name}</span>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeTeaching.mutate(t.id)}>
                <Icon name="close" size={16} label={`Remove ${t.name} (${t.subject})`} />
              </button>
            </span>
          ))}
          <form className="row-center" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (teacherId && subject.trim()) addTeaching.mutate(); }}>
            <label className="sr-only" htmlFor={`tt-${s.id}`}>Teacher</label>
            <select id={`tt-${s.id}`} className="select" style={{ minWidth: 140 }} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Teacher…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="sr-only" htmlFor={`sub-${s.id}`}>Subject</label>
            <input id={`sub-${s.id}`} className="input" style={{ width: 120 }} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <button className="btn" disabled={!teacherId || !subject.trim() || addTeaching.isPending}>Add</button>
          </form>
        </div>
      </td>
    </tr>
  );
}
