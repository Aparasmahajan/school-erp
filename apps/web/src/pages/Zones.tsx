import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { distanceMeters, parseLatLng } from '@school/core/browser';
import { api, errorText } from '../lib/api';
import { distance } from '../lib/format';
import { currentPosition, offsetMeters, type GeoReading } from '../lib/geo';
import type { ZoneRow } from '../lib/types';
import { Icon } from '../components/Icon';
import { Empty, Modal, Notice, Page, Spinner } from '../components/ui';

/**
 * Attendance zones: where staff must be to check in. Easiest set-up: stand in the middle
 * of the campus, open this page on a phone and press "Use my current location".
 */
export function Zones() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['zones'], queryFn: () => api<{ zones: ZoneRow[]; maxAccuracyM: number }>('/api/zones') });
  const [editing, setEditing] = useState<ZoneRow | 'new' | null>(null);

  const toggle = useMutation({
    mutationFn: (z: ZoneRow) => api(`/api/zones/${z.id}`, { method: 'PATCH', body: { active: !z.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
  const remove = useMutation({
    mutationFn: (z: ZoneRow) => api(`/api/zones/${z.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });

  return (
    <Page
      eyebrow="Staff attendance"
      title="Attendance zones"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> Add zone
        </button>
      }
    >
      <p className="small muted" style={{ maxWidth: 720, lineHeight: 1.6 }}>
        Staff can check in or out only while their phone or laptop reports a location inside an active zone, with accuracy of ±
        {q.data?.maxAccuracyM ?? '…'} m or better (change this in <Link to="/settings">School settings</Link>). Make the radius cover the whole campus plus a
        small margin; indoor readings often drift 20–50 m.
      </p>
      {q.isPending && <Spinner />}
      {q.error && <Notice tone="bad">{q.error.message}</Notice>}
      {(toggle.error || remove.error) && <Notice tone="bad">{errorText(toggle.error ?? remove.error)}</Notice>}
      {q.data && q.data.zones.length === 0 && <Empty>No zones yet, so nobody can check in. Add the main campus first.</Empty>}
      <div className="grid-3">
        {q.data?.zones.map((z) => (
          <section key={z.id} className="card stack">
            <div className="row-center" style={{ justifyContent: 'space-between' }}>
              <h2>{z.name}</h2>
              <span className={`badge ${z.active ? 'badge-ok' : 'badge-muted'}`}>{z.active ? 'Active' : 'Off'}</span>
            </div>
            <ZonePreview zone={z} />
            <p className="small muted num">
              {z.lat?.toFixed(5)}, {z.lng?.toFixed(5)} · radius {z.radiusM} m ·{' '}
              <a href={`https://www.google.com/maps?q=${z.lat},${z.lng}`} target="_blank" rel="noreferrer">
                open in Maps
              </a>
            </p>
            <div className="row-center">
              <button type="button" className="btn" onClick={() => setEditing(z)}>Edit</button>
              <button type="button" className="btn" onClick={() => toggle.mutate(z)}>{z.active ? 'Turn off' : 'Turn on'}</button>
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={() => window.confirm(`Delete ${z.name}? Past check-ins keep their record.`) && remove.mutate(z)}
              >
                Delete
              </button>
            </div>
          </section>
        ))}
      </div>
      {editing && <ZoneForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function ZonePreview({ zone, me }: { zone: { lat: number | null; lng: number | null; radiusM: number | null }; me?: GeoReading | null }) {
  if (zone.lat == null || zone.lng == null || !zone.radiusM) return null;
  const centre = { lat: zone.lat, lng: zone.lng };
  const off = me ? offsetMeters(centre, me) : null;
  const span = Math.max(zone.radiusM * 1.4, off ? Math.hypot(off.x, off.y) * 1.2 : 0);
  const k = 100 / span;
  return (
    <svg className="radar" style={{ maxWidth: 180 }} viewBox="-120 -120 240 240" role="img" aria-label={`Circle of ${zone.radiusM} metres${me ? `; you are ${distance(distanceMeters(centre, me))} from its centre` : ''}`}>
      <circle r={zone.radiusM * k} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <circle r="3" fill="var(--accent)" />
      {off && <circle cx={Math.max(-112, Math.min(112, off.x * k))} cy={Math.max(-112, Math.min(112, -off.y * k))} r="6" fill="#14202e" stroke="#fff" strokeWidth="2" />}
    </svg>
  );
}

function ZoneForm({ initial, onClose }: { initial: ZoneRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? 'Main campus');
  const [lat, setLat] = useState(initial?.lat != null ? String(initial.lat) : '');
  const [lng, setLng] = useState(initial?.lng != null ? String(initial.lng) : '');
  const [radius, setRadius] = useState(initial?.radiusM ?? 150);
  const [paste, setPaste] = useState('');
  const [here, setHere] = useState<GeoReading | null>(null);
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState('');

  const useHere = async () => {
    setLocating(true);
    setHint('');
    try {
      const r = await currentPosition();
      setHere(r);
      setLat(r.lat.toFixed(6));
      setLng(r.lng.toFixed(6));
      setHint(r.accuracyM > 50 ? `Reading is only accurate to ±${Math.round(r.accuracyM)} m. Step outside for a better one, or add that to the radius.` : `Got it, accurate to ±${Math.round(r.accuracyM)} m.`);
    } catch (err) {
      setHint(errorText(err));
    } finally {
      setLocating(false);
    }
  };

  const fromPaste = (text: string) => {
    setPaste(text);
    const p = parseLatLng(text);
    if (p) {
      setLat(String(p.lat));
      setLng(String(p.lng));
      setHint('Coordinates taken from the link.');
    }
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name, lat: Number(lat), lng: Number(lng), radiusM: Math.round(radius) };
      return initial ? api(`/api/zones/${initial.id}`, { method: 'PATCH', body }) : api('/api/zones', { method: 'POST', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['zones'] });
      onClose();
    },
  });

  const valid = name.trim() && lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate();
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add an attendance zone'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {save.error && <Notice tone="bad">{save.error.message}</Notice>}
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>

        <div className="row">
          <button type="button" className="btn" onClick={useHere} disabled={locating}>
            <Icon name="locate" size={18} /> {locating ? 'Finding you…' : 'Use my current location'}
          </button>
          <label className="field grow">
            Or paste a Google Maps link
            <input className="input" placeholder="https://maps.google.com/…@26.91,75.78…" value={paste} onChange={(e) => fromPaste(e.target.value)} />
          </label>
        </div>
        {hint && <p className="small muted">{hint}</p>}

        <div className="form-grid">
          <label className="field">Latitude<input className="input num" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required /></label>
          <label className="field">Longitude<input className="input num" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} required /></label>
        </div>

        <label className="field">
          Radius: <span className="num">{radius} m</span>
          <input type="range" min={20} max={2000} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
        </label>

        {valid && <ZonePreview zone={{ lat: Number(lat), lng: Number(lng), radiusM: radius }} me={here} />}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || save.isPending}>{save.isPending ? 'Saving…' : 'Save zone'}</button>
        </div>
      </form>
    </Modal>
  );
}
