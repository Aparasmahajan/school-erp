import type { Context } from 'hono';
import type { z } from 'zod';
import { HttpError } from './errors';

/**
 * Parse and validate a JSON request body. Rejects non-JSON bodies (which also blocks
 * cross-site form posts) and any field the schema does not list.
 */
export async function readBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const type = c.req.header('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Send the request body as JSON.');
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const message =
      first.code === 'unrecognized_keys'
        ? `Unexpected field${first.keys.length > 1 ? 's' : ''}: ${first.keys.join(', ')}.`
        : first.message;
    throw new HttpError(400, message, {
      field: first.path.join('.'),
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
