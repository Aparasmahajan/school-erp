# CLAUDE.md

School ERP for the web and Windows. One school per install. Google Sheets storage in v1,
a database later. Read `docs/CONTEXT.md` first: it holds the decisions, the history, and the
problems found in the previous ERP that this project must not repeat.

## Commands

- `npm run dev`: API (:8787) + web (:5173). Needs `apps/api/.env` (`npm run setup:env`).
- `npm test`: vitest in every package. `npm run typecheck`: tsc in every package.
- `npm run build`: web build. `npm start`: API (serves the web build if `WEB_DIST` is set).
- Demo logins: `principal@ / office@ / teacher@ / accounts@demo.school`, password `Demo@12345`
  (file/memory storage with `DEMO_SEED=true`; refused in production).

## Layout

- `packages/core`: shared source, imported directly (no build step): `tables.ts` (schema),
  `codec.ts`, `capabilities.ts`, `reach.ts`, `permissions.ts`, `defaults.ts`, `geo.ts`,
  `schemas.ts`, `settings.ts`, `util.ts`.
- `apps/api/src`: `app.ts` (wiring), `auth/` (middleware, tokens, passwords),
  `context.ts` (Actor, guard, audit), `routes/`, `store/` (Sheets, memory/file), `seed/`.
- `apps/web/src`: `pages/`, `components/` (Shell, ui, Icon), `lib/` (api, session, geo, types),
  `styles.css` (all design tokens).
- `apps/desktop`: Tauri 2 shell (Rust); builds the installer on Windows.
- `packages/server`: `Store<M>` (Sheets / file / memory for any schema), `HttpError`,
  `readBody`, passwords, `RateLimiter`. `apps/api/src/store|lib|auth` re-export these.
- `apps/api/src/telemetry/`: `telemetry.ts` (main thread: strips audit rows with
  `safeDetail`, builds heartbeats) and `worker.mjs` (plain JS worker thread: outbox file,
  batching, backoff, delivery to the console).
- `apps/control`: the vendor's Control console. `server/` (Hono: auth, schools, ingest,
  overview, events, admins; own schema in `schema.ts`), `web/` (React; "ledger" palette in
  `web/src/styles.css`), `scripts/init.ts`, `test/`. `npm run dev:control`; demo login
  `owner@control.demo` / `Demo@12345`.

## Rules (each has a test in apps/api/test; keep them green)

1. The actor comes from the session. Never read who is acting from a body or query.
2. Every check is `guard(c).require(capability, target)` with a target built from stored
   data. Lists filter row by row with `g.can`. Out-of-reach single records return 404.
3. `/api/*` is private by default; public routes are listed in `PUBLIC_ROUTES` only.
4. Request bodies use `z.strictObject` schemas in `packages/core/src/schemas.ts`, parsed
   with `readBody`.
5. Wrap every read-check-write in `store.exclusive(...)`. Only one API process per
   spreadsheet.
6. Every change writes `audit(...)`.
7. No defaults for secrets; config fails fast.
8. Routes never touch Google Sheets directly; go through `Store`. New table columns go at
   the END of `TABLES` (`id` stays first).
9. Colours are CSS variables in `styles.css`; never store class names or colours in data.
   No emoji icons; use `components/Icon.tsx`. Touch targets ≥ 44 px.
10. The web app's `useAccess()` only hides UI. The server decides.
11. Nothing leaves a school except via the telemetry allow-list in
    `packages/core/src/telemetry.ts`; never add names, contacts, coordinates or marks to it.
    The console re-applies it on receipt.
12. Schools report to the console's API with their install key. Never give a school's server
    the central spreadsheet's credentials (Sheets can't hide rows between schools).
13. No purple/blue "default AI" palettes. School app tokens: `apps/web/src/styles.css`;
    console: `apps/control/web/src/styles.css`. Status = colour + shape + word.

## Adding a module

Capabilities in `capabilities.ts` (with allowed reaches) → defaults in `defaults.ts` →
tables in `tables.ts` → schemas → route file registered in `app.ts` → page + menu entry in
`components/Shell.tsx` → tests for reach and permissions.

## Docs

`docs/CONTEXT.md` (decisions, old-ERP findings), `docs/ARCHITECTURE.md` (request flow,
storage, Sheets limits, deployment, security checklist), `docs/GEOFENCED_ATTENDANCE.md`,
`docs/CONTROL_CONSOLE.md` (super admin console, worker thread, privacy allow-list, keys),
`docs/DESIGN.md` (tokens, screens, canvas link), `docs/ROADMAP.md`.
