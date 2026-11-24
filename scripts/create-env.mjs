#!/usr/bin/env node
// Creates each app's .env from its .env.example with a freshly generated secret:
//   apps/api/.env       SESSION_SECRET          (a school's own server)
//   apps/control/.env   CONTROL_SESSION_SECRET  (the vendor's Control console)
// Never overwrites an existing .env.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const apps = [
  ['apps/api', 'SESSION_SECRET'],
  ['apps/control', 'CONTROL_SESSION_SECRET'],
];

for (const [dir, key] of apps) {
  const target = path.join(process.cwd(), dir, '.env');
  const example = path.join(process.cwd(), dir, '.env.example');
  if (existsSync(target)) {
    console.log(`${dir}/.env already exists; leaving it alone.`);
    continue;
  }
  const secret = randomBytes(32).toString('hex');
  const text = readFileSync(example, 'utf8').replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${secret}`);
  writeFileSync(target, text, { mode: 0o600 });
  console.log(`Created ${dir}/.env with a new ${key}.`);
}
