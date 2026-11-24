import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Page({ eyebrow, title, actions, children }: { eyebrow?: ReactNode; title: string; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Control room`;
  }, [title]);
  return (
    <>
      <header className="head">
        <div className="titles">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        {actions}
      </header>
      <main className="body">{children}</main>
    </>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="row-c muted small" role="status">
      <div className="spinner" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'ok' | 'watch' | 'alert' | 'calm'; children: ReactNode }) {
  return (
    <div className={`notice tone-${tone}`} role={tone === 'alert' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="row-c" style={{ justifyContent: 'space-between' }}>
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icon name="close" label="Close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A secret or snippet shown once, with a copy button. */
export function SecretBlock({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <pre className="secret mono" style={{ margin: 0 }}>{text}</pre>
      <button
        type="button"
        className="btn"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false))}
      >
        <Icon name="copy" size={18} /> {copied ? 'Copied' : label}
      </button>
    </div>
  );
}
