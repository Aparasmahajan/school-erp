import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SchoolSettings } from '@school/core/browser';
import { api } from '../lib/api';
import { useMe } from '../lib/session';
import { Notice, Page, Spinner } from '../components/ui';

// Grounded colours that carry white text well. Deliberately no blue or purple.
const ACCENTS = ['#13795B', '#0F766E', '#B4532A', '#9F1239', '#A16207', '#44403C'];
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

export function Settings() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState<SchoolSettings | null>(null);
  useEffect(() => {
    if (me && !form) setForm(me.school);
  }, [me, form]);

  const save = useMutation({
    mutationFn: (body: SchoolSettings) => api('/api/settings', { method: 'PUT', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['school'] });
    },
  });

  if (!form) return <Page title="School settings"><Spinner /></Page>;
  const set = <K extends keyof SchoolSettings>(k: K, v: SchoolSettings[K]) => {
    save.reset();
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <Page eyebrow="Administration" title="School settings">
      <form className="card stack" style={{ maxWidth: 720 }} onSubmit={submit}>
        {save.error && <Notice tone="bad">{save.error.message}</Notice>}
        {save.isSuccess && <Notice tone="ok">Saved.</Notice>}
        <div className="form-grid">
          <label className="field">School name<input className="input" value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} required /></label>
          <label className="field">
            Time zone <span className="hint">Decides what "today" is</span>
            <input className="input" list="tz" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} required />
            <datalist id="tz">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </label>
          <label className="field">
            Academic year starts <span className="hint">Attendance % counts from here</span>
            <input className="input" type="date" value={form.academicYearStart} onChange={(e) => set('academicYearStart', e.target.value)} required />
          </label>
          <label className="field">
            Staff start time <span className="hint">Later check-ins are marked late</span>
            <input className="input" type="time" value={form.staffStartTime} onChange={(e) => set('staffStartTime', e.target.value)} required />
          </label>
          <label className="field">
            Location accuracy needed <span className="hint">Metres; 100 suits most phones</span>
            <input className="input" type="number" min={10} max={1000} value={form.geoMaxAccuracyM} onChange={(e) => set('geoMaxAccuracyM', Number(e.target.value))} required />
          </label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small strong" style={{ marginBottom: 8 }}>School colour</legend>
          <div className="row-center">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={form.accentColor.toLowerCase() === c.toLowerCase()}
                onClick={() => set('accentColor', c)}
                style={{
                  width: 44, height: 44, borderRadius: 10, background: c, cursor: 'pointer',
                  border: form.accentColor.toLowerCase() === c.toLowerCase() ? '3px solid var(--text)' : '3px solid transparent',
                }}
              />
            ))}
            <label className="row-center small">
              Custom
              <input type="color" value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} style={{ width: 44, height: 44, border: 0, background: 'none' }} />
            </label>
          </div>
        </fieldset>
        <div>
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>
    </Page>
  );
}
