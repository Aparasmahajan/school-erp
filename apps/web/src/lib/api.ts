/**
 * One way to call the API.
 *
 * Browser: same origin, session in an httpOnly cookie the page can't read.
 * Windows app: different origin, so the session token is kept on the device and sent as a
 * Bearer header. (Move it to the OS keychain with a Tauri plugin when there is time; the
 * app loads only its own bundled code, so the exposure is small.)
 */
export const IS_DESKTOP = import.meta.env.VITE_TARGET === 'desktop';
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'school-erp.session';

function readToken(): string | null {
  if (!IS_DESKTOP) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (!IS_DESKTOP) return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the session lasts until the window closes */
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data: Record<string, unknown> | null
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  // Every write is JSON, even an empty one: the server refuses non-JSON writes.
  const body = method === 'GET' ? undefined : JSON.stringify(init.body ?? {});
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body, credentials: IS_DESKTOP ? 'omit' : 'same-origin' });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check the internet connection and try again.", null);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Something went wrong (${res.status}).`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
