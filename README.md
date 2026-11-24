# School ERP

A school ERP for the web and Windows. One school per install; data in Google Sheets for v1,
a database server later.

What it does today: sign-in and invites, roles & access with per-record reach, classes and
sections, students and guardians, daily student attendance (one save per class), geofenced
staff check-in/out with attendance zones, staff attendance, dashboard, school settings.

Plus a **Control console** for the vendor (`apps/control`): a register of every onboarded
school, live health, and every school's audit trail, fed by a worker thread in each school's
API. No student names, phones or locations ever leave a school. See `docs/CONTROL_CONSOLE.md`.

## Run it locally (5 minutes)

Needs Node 22+.

```bash
npm install
npm run setup:env      # creates apps/api/.env with a random SESSION_SECRET
npm run dev            # API on :8787, web on http://localhost:5173
```

With the default `.env` the API stores data in `apps/api/.data/school.json` and loads a demo
school the first time. Sign in at http://localhost:5173 with any of these, password
**Demo@12345**:

| Email | Sees |
|---|---|
| principal@demo.school | everything |
| office@demo.school | students, attendance, staff, zones, settings |
| teacher@demo.school | class 7-B (class teacher) and 8-A, 8-C (subject teacher) |
| accounts@demo.school | students (read only), own check-in |

The demo attendance zone is in Jaipur. To try check-in from where you are, sign in as the
principal, open **Attendance zones**, edit "Main campus" and press **Use my current location**.
Delete `apps/api/.data/` to start the demo again.

## Commands

| Command | What |
|---|---|
| `npm run dev` | API and web together, with reload |
| `npm test` | All tests (core maths and permissions; API security and check-in rules) |
| `npm run typecheck` | TypeScript across every package |
| `npm run build` | Production web build into `apps/web/dist` |
| `npm start` | Run the API (set `WEB_DIST=../web/dist` to serve the web app too) |
| `npm run init:school -- --school "…" --principal-name "…" --principal-email …` | Prepare storage for a real school and print the principal's invite link |
| `npm run sheets:check` | Check the Google Sheets connection, tabs and headers |
| `npm run desktop:dev` / `desktop:build` | Windows app (build the installer on Windows) |
| `npm run dev:control` | Control console: API :8788 + web http://localhost:5174 (demo: `owner@control.demo`, `Demo@12345`) |
| `npm run build:control` / `start:control` | Production console build / run |
| `npm run init:control -- --owner-name "…" --owner-email …` | First console owner's invite link |

## Use Google Sheets

1. In Google Cloud, create a service account and a JSON key; enable the Google Sheets API.
2. Create an empty spreadsheet for the school and **share it with the service account's
   email as Editor**.
3. In `apps/api/.env` set `STORAGE=sheets`, `GOOGLE_SHEETS_SPREADSHEET_ID` (from the sheet's
   URL), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (one line, `\n`
   for line breaks, in double quotes), and `DEMO_SEED=false`.
4. `npm run sheets:check` (creates the tabs), then
   `npm run init:school -- --school "Sunrise Public School" --principal-name "Anita Kapoor" --principal-email anita@school.in`
   and send the printed link to the principal.

Run **one** API process per spreadsheet, and treat the sheet as read-only for people while
the app is in use. Why: `docs/ARCHITECTURE.md`.

## Windows app

`apps/desktop` is a Tauri 2 shell around the same web build. On a Windows machine with
Rust and the WebView2 runtime:

```bash
# apps/web/.env.desktop: set VITE_API_URL to your hosted API, e.g. https://erp.yourschool.in
npm run desktop:build      # installer in apps/desktop/src-tauri/target/release/bundle/
```

No API change is needed: `ALLOWED_ORIGINS` already includes the Windows app's origins.

## Layout

```
packages/core     shared: tables, codec, capabilities, reach, permission check, geo, schemas,
                  telemetry allow-list
packages/server   shared server pieces: Store (Sheets / file / memory), errors, body parsing
apps/api          a school's API: auth, routes, seeds, scripts, tests, telemetry worker thread
apps/web          a school's UI (same build for browser and Windows app)
apps/desktop      Tauri 2 shell for Windows
apps/control      the vendor's Control console (server + web)
docs/             CONTEXT (why, decisions, old-ERP findings), ARCHITECTURE, GEOFENCED_ATTENDANCE,
                  CONTROL_CONSOLE, DESIGN, ROADMAP, design/ (design-canvas source)
```
