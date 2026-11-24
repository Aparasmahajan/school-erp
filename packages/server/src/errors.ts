export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 415 | 422 | 429 | 500 | 503;

/** An error with a message that is safe to show the person who made the request. */
export class HttpError extends Error {
  constructor(
    readonly status: ErrorStatus,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const forbidden = (message = "You don't have permission to do that.") => new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const badRequest = (message: string, details?: Record<string, unknown>) => new HttpError(400, message, details);
export const conflict = (message: string, details?: Record<string, unknown>) => new HttpError(409, message, details);
