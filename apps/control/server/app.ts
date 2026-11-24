import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { HttpError } from '@school/server';
import { PUBLIC_ROUTES, authenticate } from './auth';
import { publicAdmin, type ControlEnv, type Deps } from './context';
import { adminsRoutes } from './routes/admins';
import { authRoutes } from './routes/auth';
import { eventsRoutes } from './routes/events';
import { ingestRoutes } from './routes/ingest';
import { overviewRoutes } from './routes/overview';
import { schoolsRoutes } from './routes/schools';

export function createControlApp(deps: Deps): Hono<ControlEnv> {
  const app = new Hono<ControlEnv>();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
      },
    })
  );

  // Deny by default. Ingest routes are "public" here only because they check a school's
  // install key themselves instead of a console session.
  const requireSession = authenticate(deps);
  app.use('/api/*', async (c, next) => {
    if (PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) return next();
    return requireSession(c, next);
  });

  app.get('/api/health', (c) => c.json({ ok: true, storage: deps.store.kind }));
  app.get('/api/me', (c) => c.json({ admin: publicAdmin(c.get('admin')), displayTimezone: deps.config.displayTimezone, storage: deps.store.kind }));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api/ingest', ingestRoutes(deps));
  app.route('/api/overview', overviewRoutes(deps));
  app.route('/api/schools', schoolsRoutes(deps));
  app.route('/api/events', eventsRoutes(deps));
  app.route('/api/admins', adminsRoutes(deps));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.details ?? {}) }, err.status);
    console.error('[control] unhandled error', err);
    return c.json({ error: 'Something went wrong on the server. Please try again.' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not found.' }, 404));
  return app;
}
