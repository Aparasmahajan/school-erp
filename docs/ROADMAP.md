# Roadmap

Roughly in order. Each module adds capabilities to `packages/core/src/capabilities.ts`,
tables to `tables.ts` (new columns at the end only), and routes guarded the same way.

## Next

1. **Bulk import students** from a Google Sheet or CSV (schools start with hundreds), with
   a preview and per-row errors.
2. **Fees**: fee heads, term dues, collection counter with receipts (designed on the
   canvas), day book, overdue list, concessions behind a sensitive capability.
3. **Leave**: staff and student leave requests with approval; approved student leave
   pre-fills "Leave" in the register.
4. **Parent logins**: link a guardian row to a user (`guardians.userId`); `OWN_CHILD` reach
   already exists. Parent view of attendance and fees.
5. **Notifications**: SMS/WhatsApp to guardians of absent students, fee reminders, invite
   delivery by email/SMS instead of copying links.
6. **Password reset** and "sign out everywhere".

## Then

- Exams and marks, report cards (publish behind a sensitive capability).
- Timetable; period-wise attendance for subject teachers (`OWN_SECTIONS` mark reach).
- Audit log viewer for the principal.
- Suspicious check-in flags (see GEOFENCED_ATTENDANCE.md).
- Windows app: token in the OS keychain, auto-update, verify WebView2 location prompt.

## Platform

Every school runs its own install in its own place (own server, own spreadsheet or
database). Schools never share a server, and all run the same code and table structure.
That makes these the platform priorities:

- **Schema versions and migrations**: store the schema version in each school's settings
  and ship numbered migrations that each install applies on start-up, so one release
  updates schools that are on different versions safely.
- **Fleet tooling**: a config file per school and a script to deploy and update each install.
- ~~Central overview~~ **Built**: the Control console (`apps/control`) with per-school
  worker-thread reporting. Next for it: alerts by email/WhatsApp when a school goes
  offline, a yearly archive of its `events` tab, and an "open the school's app" support
  login that is time-limited and logged in the school's own audit trail.
- **Server-side admin commands**: reset a principal's password, suspend an account, issue
  an invite, run by whoever has access to that school's server.
- **Backups per school**: scheduled copies of the spreadsheet or database.
- **Custom fields** per school (house, bus route…) instead of per-school schemas.
- Year-end archive of the attendance tab.
- **Database, one per school**: SQLite (a single file next to the API, no database server)
  suits a one-school server; Postgres where a school's server is a managed cloud machine.
  Write the store, copy from Sheets with a script, retire the Sheets quota workarounds.
  Trigger: ~1,500 students or slow pages.
