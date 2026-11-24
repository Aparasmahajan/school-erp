/** The console is served from the same origin as its API; the session is an httpOnly cookie. */
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
  const body = method === 'GET' ? undefined : JSON.stringify(init.body ?? {});
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      body,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, "Can't reach the console server.", null);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new ApiError(res.status, typeof data?.error === 'string' ? data.error : `Request failed (${res.status}).`, data);
  return data as T;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');
