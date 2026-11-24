import './env';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createControlApp } from './app';
import { ConfigError, loadConfig } from './config';
import { DEMO_LOGINS, DEMO_PASSWORD, seedControlDemo } from './seed';
import { createControlStore } from './store';

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

const store = createControlStore(config);
await store.ensureSchema();

if (config.demoSeed && store.kind !== 'sheets' && (await store.all('admins')).length === 0) {
  await seedControlDemo(store, config.displayTimezone);
  console.log(`Loaded the demo network. Sign in with (password ${DEMO_PASSWORD}):`);
  for (const l of DEMO_LOGINS) console.log(`  ${l.email.padEnd(22)} ${l.label}`);
}

const app = createControlApp({ store, config });

if (config.webDist) {
  const root = config.webDist;
  app.use('/*', serveStatic({ root }));
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return serveStatic({ root, rewriteRequestPath: () => '/index.html' })(c, next);
  });
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Control console API on http://localhost:${info.port} (storage: ${store.kind})`);
});
