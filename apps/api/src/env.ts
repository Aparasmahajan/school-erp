// Loads apps/api/.env into process.env, if present. Imported first by every entry point.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
