export function ago(iso: string, now = Date.now()): string {
  if (!iso) return 'never';
  const ms = now - Date.parse(iso);
  if (ms < 60_000) return 'just now';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function when(iso: string, timeZone: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function day(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function weekdayLetter(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' });
}

export function n(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('en-IN');
}

export function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${value % 1 === 0 ? value : value.toFixed(1)}%`;
}
