import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REACH_LABELS, type Grant, type Reach } from '@school/core/browser';
import { api } from '../lib/api';
import type { RolesData } from '../lib/types';
import { Notice, Page, Spinner } from '../components/ui';

const key = (role: string, capability: string) => `${role}|${capability}`;

export function Roles() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['roles'], queryFn: () => api<RolesData>('/api/roles') });
  const [pending, setPending] = useState<Record<string, Reach>>({});
  const [saved, setSaved] = useState(false);

  const current = useMemo(() => {
    const m = new Map<string, Reach>();
    for (const g of q.data?.grants ?? []) m.set(key(g.role, g.capability), g.reach);
    return m;
  }, [q.data]);
  const locked = useMemo(() => new Set((q.data?.protected ?? []).map((g) => key(g.role, g.capability))), [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const merged = new Map(current);
      for (const [k, reach] of Object.entries(pending)) merged.set(k, reach);
      const grants: Grant[] = [...merged.entries()].map(([k, reach]) => {
        const [role, capability] = k.split('|');
        return { role, capability, reach } as Grant;
      });
      return api('/api/roles', { method: 'PUT', body: { grants } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      setPending({});
      setSaved(true);
    },
  });

  const changes = Object.entries(pending).filter(([k, v]) => (current.get(k) ?? 'NONE') !== v).length;
  const modules = q.data ? [...new Set(q.data.capabilities.map((c) => c.module))] : [];

  return (
    <Page eyebrow="Administration" title="Roles & access">
      <p className="small muted" style={{ maxWidth: 760, lineHeight: 1.6 }}>
        Each cell says whose records a role can act on. Select a cell to change it. Someone holding two roles gets both. Changes apply on each person's next
        request and are recorded in the audit log.
      </p>
      <div className="row-center small">
        {(['SCHOOL', 'OWN_CLASS', 'OWN_SECTIONS', 'OWN_CHILD', 'SELF'] as Reach[]).map((r) => (
          <span key={r} className="row-center" style={{ gap: 6 }}>
            <span className={`cell ${r}`} style={{ width: 'auto', minHeight: 26, display: 'inline-flex', alignItems: 'center', padding: '0 8px', cursor: 'default' }}>{REACH_LABELS[r]}</span>
          </span>
        ))}
      </div>

      {q.isPending && <Spinner />}
      {q.error && <Notice tone="bad">{q.error.message}</Notice>}
      {save.error && <Notice tone="bad">{save.error.message}</Notice>}
      {saved && changes === 0 && <Notice tone="ok">Saved.</Notice>}
      {changes > 0 && (
        <div className="notice notice-warn row-center" role="status">
          <span style={{ flex: 1 }} className="strong">{changes === 1 ? '1 change' : `${changes} changes`} not saved yet</span>
          <button type="button" className="btn" onClick={() => setPending({})}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      {q.data && (
        <section className="card card-flush" aria-label="Permission matrix">
          <div className="table-wrap">
            <div className="matrix">
              <div className="matrix-row matrix-head">
                <span className="tiny strong muted" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Permission</span>
                {q.data.roles.map((r) => (
                  <div key={r.key} style={{ textAlign: 'center' }}>
                    <p className="small strong">{r.label}</p>
                    <p className="tiny muted num">{r.holders} {r.holders === 1 ? 'person' : 'people'}</p>
                  </div>
                ))}
              </div>
              {modules.map((m) => (
                <div key={m}>
                  <p className="matrix-group">{m}</p>
                  {q.data.capabilities
                    .filter((c) => c.module === m)
                    .map((c) => (
                      <div key={c.id} className="matrix-row">
                        <span className="small">
                          {c.label}
                          {c.sensitive && <span className="badge badge-warn" style={{ marginLeft: 8 }}>Sensitive</span>}
                        </span>
                        {q.data.roles.map((r) => {
                          const k = key(r.key, c.id);
                          const value = pending[k] ?? current.get(k) ?? 'NONE';
                          const cycle = c.allowed;
                          const next = cycle[(cycle.indexOf(value) + 1) % cycle.length];
                          const isLocked = locked.has(k);
                          return (
                            <button
                              key={r.key}
                              type="button"
                              className={`cell ${value}${(current.get(k) ?? 'NONE') !== value ? ' changed' : ''}`}
                              disabled={isLocked || cycle.length < 2}
                              title={isLocked ? "Kept so the school can't lock itself out" : undefined}
                              aria-label={`${c.label} for ${r.label}: ${REACH_LABELS[value]}.${isLocked ? ' Cannot be changed.' : ` Select to change to ${REACH_LABELS[next]}.`}`}
                              onClick={() => {
                                setSaved(false);
                                setPending((p) => ({ ...p, [k]: next }));
                              }}
                            >
                              {value === 'NONE' ? '—' : REACH_LABELS[value]}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </Page>
  );
}
