import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { MarkStatus } from '@school/core/browser';
import { api } from '../lib/api';
import { dateTime, longDate, pct } from '../lib/format';
import { useMe } from '../lib/session';
import type { AttendanceView, ClassInfo } from '../lib/types';
import { Avatar, Empty, Notice, Page, Spinner } from '../components/ui';

const OPTIONS: { key: MarkStatus; label: string }[] = [
  { key: 'P', label: 'Present' },
  { key: 'A', label: 'Absent' },
  { key: 'L', label: 'Late' },
  { key: 'LV', label: 'Leave' },
];

export function Attendance() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api<{ classes: ClassInfo[] }>('/api/classes') });

  const sections = useMemo(
    () =>
      (classes.data?.classes ?? [])
        .flatMap((c) => c.sections)
        .filter((s) => s.canViewAttendance || s.canMarkAttendance || s.canAmendAttendance),
    [classes.data]
  );
  const preferred = sections.find((s) => me?.classTeacherOf.includes(s.id)) ?? sections[0];
  const sectionId = params.get('section') || preferred?.id || '';
  const date = params.get('date') || me?.today || '';

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <Page eyebrow={date ? longDate(date) : ''} title="Attendance">
      <div className="row">
        <label className="field">
          Section
          <select className="select" value={sectionId} onChange={(e) => set('section', e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {me?.classTeacherOf.includes(s.id) ? ' (your class)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Date
          <input className="input" type="date" value={date} max={me?.today} onChange={(e) => e.target.value && set('date', e.target.value)} />
        </label>
      </div>
      {classes.isPending && <Spinner />}
      {classes.data && sections.length === 0 && <Empty>You don't look after any sections yet.</Empty>}
      {sectionId && date && <Register key={`${sectionId}|${date}`} sectionId={sectionId} date={date} />}
    </Page>
  );
}

function Register({ sectionId, date }: { sectionId: string; date: string }) {
  const qc = useQueryClient();
  const view = useQuery({
    queryKey: ['attendance', sectionId, date],
    queryFn: () => api<AttendanceView>(`/api/attendance?sectionId=${sectionId}&date=${date}`),
  });
  const [marks, setMarks] = useState<Record<string, MarkStatus>>({});
  const [saved, setSaved] = useState<string>('');
  const [q, setQ] = useState('');

  const data = view.data;
  const editable = data?.mode === 'mark' || data?.mode === 'amend';

  // Start from the saved record, or everyone present for a new register.
  useEffect(() => {
    if (!data) return;
    const initial: Record<string, MarkStatus> = {};
    for (const s of data.roster) initial[s.id] = data.record?.marks[s.id] ?? 'P';
    setMarks(initial);
  }, [data]);

  // A new register can always be saved; a saved one only when something changed.
  const dirty = !!data && (!data.record || data.roster.some((s) => marks[s.id] !== (data.record!.marks[s.id] ?? 'P')));

  const save = useMutation({
    mutationFn: () => api<{ savedAt: string; counts: Record<string, number> }>('/api/attendance', { method: 'PUT', body: { sectionId, date, marks } }),
    onSuccess: (res) => {
      setSaved(res.savedAt);
      void qc.invalidateQueries({ queryKey: ['attendance', sectionId, date] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (view.isPending) return <Spinner />;
  if (view.error) return <Notice tone="bad">{view.error.message}</Notice>;
  if (!data) return null;

  const counts = { P: 0, A: 0, L: 0, LV: 0 } as Record<MarkStatus, number>;
  for (const s of data.roster) counts[marks[s.id] ?? 'P'] += 1;
  const rows = data.roster.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || String(s.rollNo ?? '') === q.trim());

  const setOne = (id: string, status: MarkStatus) => {
    setSaved('');
    setMarks((m) => ({ ...m, [id]: status }));
  };

  return (
    <div className="split">
      <section className="card card-flush wide" aria-label={`Register for ${data.section.label}`}>
        <div className="row-center" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
          <label className="field grow" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="sr-only">Find a student</span>
            <input className="input" type="search" placeholder="Find by name or roll number" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {editable && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSaved('');
                setMarks(Object.fromEntries(data.roster.map((s) => [s.id, marks[s.id] === 'LV' ? 'LV' : 'P'])) as Record<string, MarkStatus>);
              }}
            >
              Mark all present
            </button>
          )}
        </div>
        {data.roster.length === 0 && <Empty>No students in this section yet.</Empty>}
        {!editable && !data.record && data.roster.length > 0 && (
          <div style={{ padding: 16 }}>
            <Notice tone="info">{data.mode === 'future' ? "This date hasn't happened yet." : 'Not marked for this day.'}</Notice>
          </div>
        )}
        {(editable || data.record) &&
          rows.map((s) => {
            const status = marks[s.id] ?? 'P';
            return (
              <div key={s.id} className={`roster-row${status === 'A' ? ' absent' : ''}`}>
                <span className="roll num">{s.rollNo ?? '–'}</span>
                <Avatar name={s.name} />
                <div className="who">
                  <p className="small strong">{s.name}</p>
                  <p className="tiny muted">{pct(s.attendancePct)} this year</p>
                </div>
                <div className="seg" role="group" aria-label={`Status for ${s.name}`}>
                  {OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className={o.key}
                      aria-pressed={status === o.key}
                      disabled={!editable}
                      onClick={() => setOne(s.id, o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
      </section>

      <aside className="narrow">
        <section className="card stack">
          <h2>{data.section.label}</h2>
          <div className="tally">
            <div>
              <p>Present</p>
              <p>{counts.P}</p>
            </div>
            <div className="bad">
              <p>Absent</p>
              <p>{counts.A}</p>
            </div>
            <div>
              <p>Late</p>
              <p>{counts.L}</p>
            </div>
            <div>
              <p>On leave</p>
              <p>{counts.LV}</p>
            </div>
          </div>
          {data.record && (
            <p className="tiny muted">
              Marked by {data.record.markedBy || 'someone'} at {dateTime(data.record.markedAt)}
              {data.record.updatedAt && `; last changed by ${data.record.updatedBy} at ${dateTime(data.record.updatedAt)}`}.
            </p>
          )}
        </section>

        {data.mode === 'amend' && (
          <Notice tone="warn">You're changing a past day. The change is recorded with your name in the audit log.</Notice>
        )}
        {data.mode === 'view' && data.record && <Notice tone="info">You can view this register but not change it.</Notice>}
        {save.error && <Notice tone="bad">{save.error.message}</Notice>}
        {saved && !save.isPending && <Notice tone="ok">Saved at {dateTime(saved)}.</Notice>}

        {editable && data.roster.length > 0 && (
          <>
            <button type="button" className="btn btn-primary btn-big" disabled={save.isPending || !dirty} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : data.record ? 'Save changes' : `Save attendance for ${data.roster.length} students`}
            </button>
            <p className="tiny muted" style={{ textAlign: 'center' }}>
              The whole class is saved in one go. SMS to guardians of absent students isn't set up yet.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
