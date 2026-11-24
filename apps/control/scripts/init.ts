/**
 * Prepare the Control console's storage and invite its first owner.
 *
 *   npm run init:control -- --owner-name "Your Name" --owner-email you@company.in
 *
 * Add --demo (development only) to load the example network as well.
 */
import '../server/env';
import { parseArgs } from 'node:util';
import { newId } from '@school/core';
import { signInvite } from '../server/auth';
import { ConfigError, loadConfig } from '../server/config';
import { DEMO_LOGINS, DEMO_PASSWORD, seedControlDemo } from '../server/seed';
import { createControlStore } from '../server/store';

const { values } = parseArgs({
  options: {
    'owner-name': { type: 'string' },
    'owner-email': { type: 'string' },
    demo: { type: 'boolean', default: false },
  },
});

try {
  const config = loadConfig();
  const store = createControlStore(config);
  console.log(`Preparing ${store.kind} storage…`);
  await store.ensureSchema();

  if (values.demo) {
    if (config.env === 'production') throw new ConfigError('--demo is not allowed in production.');
    await seedControlDemo(store, config.displayTimezone);
    console.log(`Demo network loaded. Logins (password ${DEMO_PASSWORD}):`);
    for (const l of DEMO_LOGINS) console.log(`  ${l.email.padEnd(22)} ${l.label}`);
  }

  if (values['owner-email']) {
    const email = values['owner-email'].trim().toLowerCase();
    const existing = (await store.all('admins')).find((a) => a.email === email);
    if (existing) {
      console.log(`${email} already has a console account.`);
    } else {
      const id = newId('adm');
      await store.insert('admins', [
        { id, email, name: values['owner-name'] ?? email, passwordHash: '', role: 'OWNER', status: 'INVITED', createdAt: new Date().toISOString(), createdBy: 'setup', lastLoginAt: '' },
      ]);
      const token = await signInvite(id, config.sessionSecret);
      console.log('\nOpen this link (valid 7 days) to set the owner password:');
      console.log(`  ${config.publicUrl}/accept-invite?token=${encodeURIComponent(token)}`);
    }
  }
  console.log('Done.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
