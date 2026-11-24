/**
 * Prepare storage for a new school and invite its first principal.
 *
 *   npm run init:school -- --school "Sunrise Public School" \
 *     --principal-name "Anita Kapoor" --principal-email anita@school.in
 *
 * Add --demo (development only) to load the demo school as well.
 * Safe to run twice: it only adds what is missing.
 */
import '../src/env';
import { parseArgs } from 'node:util';
import { isValidTimeZone } from '@school/core';
import { signInvite } from '../src/auth/tokens';
import { ConfigError, loadConfig } from '../src/config';
import { seedBase } from '../src/seed/base';
import { DEMO_LOGINS, DEMO_PASSWORD, seedDemo } from '../src/seed/demo';
import { createStore } from '../src/store';

const { values } = parseArgs({
  options: {
    school: { type: 'string' },
    timezone: { type: 'string' },
    'principal-name': { type: 'string' },
    'principal-email': { type: 'string' },
    demo: { type: 'boolean', default: false },
  },
});

try {
  const config = loadConfig();
  if (values.timezone && !isValidTimeZone(values.timezone)) throw new ConfigError(`"${values.timezone}" is not a time zone.`);
  if (!!values['principal-name'] !== !!values['principal-email']) {
    throw new ConfigError('Give both --principal-name and --principal-email, or neither.');
  }

  const store = createStore(config);
  console.log(`Preparing ${store.kind} storage…`);
  const result = await seedBase(store, {
    schoolName: values.school,
    timezone: values.timezone,
    principal: values['principal-email'] ? { name: values['principal-name']!, email: values['principal-email'] } : undefined,
  });
  console.log('Tables, settings and the default roles matrix are in place.');

  if (values.demo) {
    if (config.env === 'production') throw new ConfigError('--demo is not allowed in production.');
    await seedDemo(store);
    console.log(`Demo school loaded. Logins (password ${DEMO_PASSWORD}):`);
    for (const l of DEMO_LOGINS) console.log(`  ${l.email.padEnd(24)} ${l.label}`);
  }

  if (result.principalId) {
    if (result.createdPrincipal) {
      const token = await signInvite(result.principalId, config.sessionSecret);
      console.log('\nSend this link to the principal (valid 7 days) to set their password:');
      console.log(`  ${config.publicUrl}/accept-invite?token=${encodeURIComponent(token)}`);
    } else {
      console.log('\nThat principal already has an account; no new invite was created.');
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
