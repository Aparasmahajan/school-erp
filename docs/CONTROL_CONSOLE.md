# Control console (super admin)

The vendor's own app for running the school network: a register of every onboarded school,
live health, and each school's audit trail in one place. It lives in `apps/control` and is
deployed once, separately from every school.

```
 School A server ──worker thread──┐   HTTPS + install key A
 School B server ──worker thread──┼──▶ Control console API ──▶ central "all schools" spreadsheet
 School C server ──worker thread──┘    (apps/control)           (only the console can open it)
                                              ▲
                                     console team (browser)
```

## Why schools don't write to the central sheet directly

Google Sheets can't hide rows from someone who has access to the file. If every school's
server held credentials for the central spreadsheet, every school could read and edit every
other school's records, and one compromised school server would expose the whole network.
So only the console holds those credentials. Schools send their reports to the console's
API with their own install key, and a report can only ever be filed under that school.

## What a school sends (and what it never sends)

A worker thread in each school's API (`apps/api/src/telemetry/`) sends two things:

| Message | When | Contents |
|---|---|---|
| Heartbeat | every 5 minutes (`TELEMETRY_HEARTBEAT_SECONDS`) | app and schema version, storage type, school name and time zone, counts (students, staff, sections), sections marked today, % present today, staff checked in today, server errors since last time, events waiting to send or dropped, uptime |
| Audit events | within ~15 s of each change (`TELEMETRY_FLUSH_SECONDS`) | id, time, action, record type and id, actor id and **roles**, and an allow-listed detail: dates, section ids, statuses, roles, counts (present/absent/late/leave/changed), zone id, distance and accuracy |

**Never sent:** names, emails, phone numbers, addresses, dates of birth, GPS coordinates,
individual attendance marks. The allow-list is in `packages/core/src/telemetry.ts`
(`safeDetail`). The school applies it before sending, and the console applies it **again**
on receipt (`cleanDetail`), so an old or buggy school can't leak data into the register.
Tests check both sides (`apps/api/test/telemetry.test.ts`, `apps/control/test/control.test.ts`).

### Delivery

- The worker is a separate thread (`worker_threads`), so reporting never slows the school's
  own requests.
- Events wait in an outbox file (`TELEMETRY_OUTBOX`) until the console confirms them, so a
  network outage or restart loses nothing. The queue is capped at 10,000 events; anything
  older is dropped and the count is reported in the next heartbeat.
- Failures back off exponentially up to 5 minutes. A refused key (401/403) is logged clearly.
- The console ignores a batch it has already stored (retries are safe).

## Install keys

- Created when a school is onboarded and shown **once**, as three lines to paste into that
  school's `apps/api/.env` (`CONTROL_URL`, `CONTROL_SCHOOL_ID`, `CONTROL_INSTALL_KEY`).
- Stored only as a SHA-256 fingerprint plus the first 10 characters for recognition.
- **New install key** on the school's page replaces it; the old key stops working at once.
- Offboarding a school stops its key. Issuing a new key brings it back to onboarding.
- The school API refuses `http://` for `CONTROL_URL` in production (except localhost) and
  refuses the published demo key.

## Screens

| Screen | Who | What |
|---|---|---|
| Overview | everyone | Totals, "needs a look" list with plain-language problems, a card per school, 14-day activity grid |
| Schools | everyone; onboarding by owners | Register with stage and health; onboard a school and get its key |
| School page | everyone; changes by owners | Right now (counts, attendance, queue, version), recent days (attendance % and staff check-ins), latest activity, stage (suspend / resume / offboard), details, install key |
| Audit trail | everyone | Every school's trail with filters by school, kind, action, dates and search |
| Console team | owners | Invite people as Owner or Viewer, suspend, reissue invite links; there is always one active owner |
| Console log | owners | Everything done in the console: sign-ins, onboarding, key changes, stage changes |

**Health** comes from the last report. Live means a report within 20 minutes
(`STALE_AFTER_MINUTES`). Quiet means up to 2 hours (`OFFLINE_AFTER_MINUTES`). After that the
school is offline. A school that has never reported shows as "not reporting yet", and a
suspended or offboarded one as paused. Problems listed: no recent report, server errors,
events lost or waiting, test-mode storage, older version than the newest in the network.

**Stages**: Onboarding → Live (automatic on the first report) → Suspended ↔ Live →
Offboarded.

## Colours

The palette is "ledger": warm limestone and paper, ink text, terracotta as the only brand
colour, and ink primary buttons. Status colours are natural pigments:

- moss: live
- turmeric: quiet
- brick: offline or errors
- teal: setting up
- stone: paused

Each status also has its own shape and always its word. Healthy and problem states also
differ strongly in lightness. There is no purple or blue anywhere. Tokens:
`apps/control/web/src/styles.css`.

## Running it

```bash
npm run setup:env          # creates apps/control/.env with a secret (and apps/api/.env)
npm run dev:control        # console API :8788 + web http://localhost:5174, demo network loaded
```

Demo logins: `owner@control.demo` and `viewer@control.demo`, password `Demo@12345`.

To watch a school report in live, run both demos. Uncomment the three `CONTROL_*` lines in
`apps/api/.env.example`, copy them into `apps/api/.env`, then run `npm run dev` and
`npm run dev:control`. "Sunrise Public School (demo)" then shows the school demo's real
numbers, and its trail updates as you use the school app.

Production:

```bash
npm run build:control
cd apps/control && NODE_ENV=production STORAGE=sheets WEB_DIST=web/dist npm start
npm run init:control -- --owner-name "Your Name" --owner-email you@company.in   # prints the first owner's invite link
```

Use the console's own spreadsheet and service account (`GOOGLE_*` in `apps/control/.env`),
never a school's. Run one console process, behind HTTPS.

## Capacity

Each heartbeat updates the school's row. One history row per school per hour is kept
(`HEARTBEAT_HISTORY_MINUTES`). Audit events are the volume: roughly 50–150 a school day per
school, so 10 schools add about 300,000 rows a year. That's fine for a year in Sheets;
archive the `events` tab yearly, or move the console to a database first. It is a single
deployment, so the move is simpler than for schools.
