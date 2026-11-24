# Architecture

```
  Browser (phone / PC)            Windows app (Tauri 2, WebView2)
  same build of apps/web          same build of apps/web, --mode desktop
        │  cookie session                │  Bearer token, CORS allow-list
        └──────────────┬─────────────────┘
                       ▼
            apps/api  (Hono on Node, ONE process per school)
            ├─ auth middleware: deny by default, session → user → Actor
            ├─ routes: guard(c).require(capability, target)
            └─ Store interface ─┬─ SheetsStore  (v1 production)
                                ├─ MemoryStore + file  (dev / single-laptop pilot)
                                └─ PostgresStore  (later)
                       ▼
            Google Sheets: one spreadsheet per school, one tab per table

  packages/core   — shared by every app: tables, codec, capabilities, reach,
                    permission check, geofence maths, input schemas, settings,
                    telemetry allow-list and report formats
  packages/server — shared server pieces: Store (Sheets / file / memory, any schema),
                    errors, JSON body parsing, passwords, rate limiting

  ── the vendor's side (one deployment for the whole network) ──

  each school's API ── worker thread ── HTTPS + install key ──▶ apps/control (Control console)
                                                                 └─ its own central spreadsheet
```

Each school also runs a **telemetry worker thread** that reports its audit trail (stripped
of personal data) and a health heartbeat to the vendor's Control console. Details, the
privacy allow-list and why schools never touch the central sheet: `CONTROL_CONSOLE.md`.

## Packages

| Path | What | Notes |
|---|---|---|
| `packages/core` | Pure TypeScript, no I/O | Imported as source by both apps. Anything both sides must agree on lives here. |
| `apps/api` | Hono HTTP API | The only code that reads or writes storage. Runs with `tsx`. In production it also serves the built web app (`WEB_DIST`) so pages and API share one origin. |
| `apps/web` | React 19 + Vite + TanStack Query | Plain CSS with design tokens (`src/styles.css`). `HashRouter` in the Windows app, `BrowserRouter` on the web. |
| `apps/desktop` | Tauri 2 shell | Loads `apps/web/dist`. Holds no data and no Google credentials. |
| `packages/server` | Store + server helpers | `Store<M>` works for any schema, so the school app and the console share the Sheets/file code. |
| `apps/control` | Control console (server + web) | The vendor's register, health monitor and network-wide audit trail. Separate secrets, cookie, spreadsheet. |

## A request, end to end

1. `app.ts`: security headers (CSP, frame-ancestors none), CORS for the Windows app's origins.
2. Deny-by-default middleware: unless `METHOD /path` is in `PUBLIC_ROUTES`, `authenticate()` runs.
3. `authenticate()`: token from `Authorization: Bearer` or the `sess` cookie → verify (HS256,
   audience `school-erp:session`) → load the user → must be `ACTIVE` and its password
   fingerprint must match → for cookie writes, require JSON and a same-site `Origin` →
   build the `Actor` (roles, class-teacher sections, taught sections, linked children) and
   load the grants matrix.
4. Route: `readBody(c, schema)` (strict zod schema, 415 for non-JSON) → `guard(c).require(cap, target)`
   where `target` is built from **stored** data → `store.exclusive(...)` around any
   read-check-write → `audit(...)`.
5. `onError`: `HttpError` messages go to the user; anything else is logged and becomes a
   generic 500.

## Permissions

- **Capability**: a verb (`attendance.mark`). Catalogue: `packages/core/src/capabilities.ts`.
  Each lists the reaches that make sense for it.
- **Reach**: whose records — `SCHOOL`, `OWN_CLASS`, `OWN_SECTIONS`, `OWN_CHILD`, `SELF`, `NONE`.
  Not a ladder, so checks test the target against each grant.
- **Grant**: role × capability × reach, stored in `role_grants`, edited on Roles & access.
  Defaults in `defaults.ts`. `PROTECTED_GRANTS` (Principal keeps `roles.manage`) can't be removed.
- **Check**: `can(actor, capability, target, grants)` — true if any of the actor's roles has a
  grant whose reach covers the target. Lists filter row by row with the same function.
- The web app receives `access` (capability → reaches) from `/api/me` only to show or hide
  things. It is never trusted.

Adding a capability: add it to `CAPABILITY_IDS` and `CAPABILITIES`, give defaults, check it
in the route with `guard(c).require`, show it in the UI with `useAccess().can`. Existing
schools keep their saved matrix; new capabilities start as "no access" there until the
principal grants them (or ship a small migration).

## Storage

`Store` (`apps/api/src/store/types.ts`): `all`, `insert`, `update`, `remove`, `replaceAll`,
`exclusive`, `ensureSchema`. Rows are encoded by `packages/core/src/codec.ts`, so the
memory store in tests holds exactly what the sheet would.

Tables (`packages/core/src/tables.ts`): settings, users, user_roles, role_grants, classes,
sections, teaching, students, guardians, attendance, geofences, staff_attendance, audit.
`id` is always the first column; new columns go at the end.

### Google Sheets specifics (`store/sheets.ts`)

- Reads are cached (`SHEETS_CACHE_SECONDS`, default 60 s). A refresh loads **every** stale tab
  in one `batchGet`, so a page needing six tables is one request.
- This process invalidates its own cache on writes, so it always sees its own changes.
- Updates and deletes re-read the tab first to find the right row; a write lock serialises them.
- `exclusive()` serialises check-then-write sequences. **Run exactly one API process per
  spreadsheet**; two processes would each have their own lock.
- All values are written as text with `valueInputOption: RAW` (no formulas, no date
  guessing). Read with `UNFORMATTED_VALUE`.
- On start, missing tabs are created and header rows written. A header row that differs
  from the expected columns (other than missing trailing columns) stops the API with a
  clear message instead of misreading every row.
- 429 and 5xx are retried with exponential backoff.
- Treat the sheet as read-only for people while the app is in use. Inserting or deleting rows
  by hand can race with a write.

### Capacity

Student attendance is **one row per section per day** (statuses as JSON keyed by short ids),
not one per student. 36 sections × ~220 days ≈ 8,000 rows a year instead of ~250,000.
Each row is ~0.6–1 KB, so the attendance tab grows by several MB a year and every cache
refresh re-reads it. Plan to archive the attendance tab at each year end, and move to the
database once a school passes ~1,500 students or the API feels slow.

### Moving to a database

Write `PostgresStore implements Store` (same seven methods), create tables from `TABLES`,
copy every tab across with a one-off script using `decodeRow`, point `STORAGE` at it.
Routes, permissions, the web app and the Windows app don't change.

## Authentication details

- Passwords: bcrypt cost 10. Login compares against a dummy hash for unknown emails (no
  timing difference) and returns one message for unknown email and wrong password.
- Rate limit: 10 attempts per email per 15 minutes, in memory (resets on restart; someone
  can lock an account for 15 minutes — acceptable for v1).
- Sessions: 12 h. Web: `sess` cookie, httpOnly, SameSite=Lax, Secure in production.
  Windows app: the same token as a Bearer header, kept in the app's local storage (move to
  the OS keychain later).
- Invites: 7 days, separate audience, refused once a password is set.
- **Known limitation**: signing out deletes the cookie but doesn't revoke the token; a copied
  token stays valid until it expires. Changing the password or suspending the account does
  revoke it.

## Deployment (v1)

Every school is a separate install in its own place: its own server, its own spreadsheet
(later its own database). Schools never share a server, and every install runs the same
code and table structure. A school's server can be a small cloud VM or a machine at the
school; if it's on the school's own network it still needs a real domain and HTTPS,
because phones only share location over HTTPS.

One small always-on Node host per school (e.g. a 512 MB VM or a Render/Railway instance):

```
cd apps/web && npm run build
cd apps/api && NODE_ENV=production STORAGE=sheets WEB_DIST=../web/dist npm start
```

Put it behind HTTPS (required for location access and secure cookies). Serverless hosts
also work, but each instance has its own cache and lock, which breaks the "one process"
rule above; avoid them until the database move.

The Windows installer is built on a Windows machine (`npm run desktop:build`) with
`VITE_API_URL` in `apps/web/.env.desktop` pointing at that host.

## Security invariants (review checklist)

1. The actor comes from the session, never from the request.
2. Every permission check names a target built from stored data.
3. Lists filter by reach row by row; out-of-reach single records are 404.
4. Every new `/api` route is private unless added to `PUBLIC_ROUTES`.
5. Every request body schema is `z.strictObject`.
6. Every read-check-write runs in `store.exclusive`.
7. Every change writes an audit row.
8. No secrets have defaults; the API refuses to start without them.
9. Nothing in the web app is trusted; it only hides what the server would refuse.
10. Nothing leaves a school except through the telemetry allow-list (`safeDetail`); the
    console re-applies it (`cleanDetail`). Adding a field to the allow-list is a privacy
    decision; never add names, contact details, coordinates or marks.
11. Only the Control console holds the central spreadsheet's credentials.
