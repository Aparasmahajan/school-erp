import './env';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { ConfigError, loadConfig } from './config';
import { DEMO_LOGINS, DEMO_PASSWORD, seedDemo } from './seed/demo';
import { createStore } from './store';
import { Telemetry } from './telemetry/telemetry';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const store = createStore(config);
await store.ensureSchema();

if (config.demoSeed && store.kind !== 'sheets' && (await store.all('students')).length === 0) {
  await seedDemo(store);
  console.log(`Loaded the demo school. Sign in with any of these (password ${DEMO_PASSWORD}):`);
  for (const l of DEMO_LOGINS) console.log(`  ${l.email.padEnd(24)} ${l.label}`);
}

const app = createApp({ store, config });

// Production: serve the built web app from this process, so pages and API share one
// origin and the session cookie stays first-party.
if (config.webDist) {
  const root = config.webDist;
  app.use('/*', serveStatic({ root }));
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return serveStatic({ root, rewriteRequestPath: () => '/index.html' })(c, next);
  });
}

if (config.control) {
  const telemetry = new Telemetry(store, config, config.control);
  telemetry.start();
  console.log(`Reporting to the Control console at ${config.control.url} as ${config.control.schoolId}.`);
  const shutdown = () => void telemetry.stop().finally(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`School ERP API on http://localhost:${info.port} (storage: ${store.kind})`);
});
