import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { PUBLIC_ROUTES, authenticate } from './auth/middleware';
import { emitServerError, getSettings, type AppEnv, type Deps } from './context';
import { HttpError } from './lib/errors';
import { attendanceRoutes } from './routes/attendance';
import { authRoutes } from './routes/auth';
import { classesRoutes } from './routes/classes';
import { dashboardRoutes } from './routes/dashboard';
import { meRoutes } from './routes/me';
import { rolesRoutes } from './routes/roles';
import { settingsRoutes } from './routes/settings';
import { staffRoutes } from './routes/staff';
import { staffAttendanceRoutes } from './routes/staffAttendance';
import { studentsRoutes } from './routes/students';
import { zonesRoutes } from './routes/zones';

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

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

  // The Windows app runs on its own origin and authenticates with a Bearer token, so
  // only its origins are allowed cross-origin; cookies are never sent cross-origin.
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (deps.config.allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    })
  );

  // Deny by default: every /api route needs a session unless listed in PUBLIC_ROUTES.
  const requireSession = authenticate(deps);
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'OPTIONS' || PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) return next();
    return requireSession(c, next);
  });

  app.get('/api/health', (c) => c.json({ ok: true, storage: deps.store.kind }));
  app.get('/api/school', async (c) => {
    const s = await getSettings(deps.store, deps.config);
    return c.json({ schoolName: s.schoolName, accentColor: s.accentColor });
  });

  app.route('/api/auth', authRoutes(deps));
  app.route('/api/me', meRoutes(deps));
  app.route('/api/dashboard', dashboardRoutes(deps));
  app.route('/api/classes', classesRoutes(deps));
  app.route('/api/students', studentsRoutes(deps));
  app.route('/api/attendance', attendanceRoutes(deps));
  app.route('/api/staff', staffRoutes(deps));
  app.route('/api/staff-attendance', staffAttendanceRoutes(deps));
  app.route('/api/zones', zonesRoutes(deps));
  app.route('/api/roles', rolesRoutes(deps));
  app.route('/api/settings', settingsRoutes(deps));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.details ?? {}) }, err.status);
    console.error('[api] unhandled error', err);
    emitServerError(deps.store, err);
    return c.json({ error: 'Something went wrong on the server. Please try again.' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not found.' }, 404));

  return app;
}
