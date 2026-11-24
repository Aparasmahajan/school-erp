/**
 * Browser entry point: everything the web apps use, WITHOUT the zod request schemas.
 *
 * Zod builds its validators when the module loads and probes `new Function("")` while
 * doing so. Under the apps' Content-Security-Policy (no 'unsafe-eval') the browser reports
 * that as a violation on every page, and the browser never validates requests anyway; the
 * server does. Import from '@school/core/browser' in apps/web and apps/control/web.
 */
export * from './roles';
export * from './reach';
export * from './capabilities';
export * from './permissions';
export * from './defaults';
export * from './tables';
export * from './codec';
export * from './geo';
export * from './dates';
export * from './util';
export * from './settings';
