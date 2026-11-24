import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Page({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · School ERP`;
  }, [title]);
  return (
    <>
      <header className="topbar">
        <div className="titles">
          {eyebrow && <p className="muted small">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        {actions}
      </header>
      <main className="content">{children}</main>
    </>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="row-center muted small" role="status">
      <div className="spinner" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div className={`avatar${large ? ' lg' : ''}`} aria-hidden="true">
      {letters}
    </div>
  );
}

/** A dialog with a real heading, Escape to close, and focus moved inside on open. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="row-center" style={{ justifyContent: 'space-between' }}>
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn"
      onClick={(e) => {
        const button = e.currentTarget;
        navigator.clipboard
          .writeText(text)
          .then(() => {
            button.textContent = 'Copied';
          })
          .catch(() => {
            button.textContent = 'Select and copy the link above';
          });
      }}
    >
      <Icon name="copy" size={18} />
      {label}
    </button>
  );
}
