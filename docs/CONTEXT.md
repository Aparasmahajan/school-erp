# Project context

Why this project exists, what was decided, and what was learned from the ERP that came
before it. This file is self-contained on purpose: you should not need the old repository
to understand any of it.

---

## 1. Decisions (24 Nov 2026)

| Topic | Decision | Why |
|---|---|---|
| Product | A **school-only** ERP, in a **new repository** | The previous ERP was a generic multi-industry template (schools, hospitals, gyms, logistics…). A school needs its own domain: students, guardians, classes and sections, subjects, attendance, fees, exams. |
| Platforms | **Web and a Windows app**, one UI codebase | Schools run the office on Windows laptops; teachers use phones. The Windows app (Tauri) wraps the same web build. |
| Storage, v1 | **Google Sheets API**, one spreadsheet per school | Cheap, familiar to schools, readable by the office. The API is the only thing that touches it. |
| Storage, later | A **database server** (Postgres planned) "after it works" | Sheets has quotas, no transactions and slows down as attendance grows. Everything goes through one `Store` interface so this is one new class plus a copy script. |
| Tenancy | **One school per install, each in its own place** | Each school gets its own server, its own spreadsheet (later its own database), in its own location. Schools **never** share a server. There is no `tenantId` on any row, so one school's data can't leak into another's. Selling to many schools means many installs. |
| Schema | **Same table structure for every school**, versioned | All schools run the same code and tables so one release updates everyone. Per-school differences go in settings, the roles matrix, module switches and (later) custom fields, never in a different schema per school. |
| Design | A **fresh, school-specific look**, not the org's Azalio design system | The user asked for a different design to go with the different repo. |
| New feature | **Geofenced staff attendance** | Admin sets allowed zones; staff check in and out only from inside one; the server checks the location. See `GEOFENCED_ATTENDANCE.md`. |
| Super admin | **A separate Control console** (`apps/control`) with its own central spreadsheet listing every onboarded school | The vendor needs one place to onboard schools, see their health and read their audit trails. See `CONTROL_CONSOLE.md`. |
| Reporting | **A worker thread in each school's API** sends its audit trail and health to the console, **through the console's API with a per-school install key**, never by writing to the central sheet itself | Sheets can't hide rows, so giving every school access to the central sheet would let any school (or anyone who breaks into one) read and change every other school's records. |
| Privacy | Only ids, dates, counts, statuses and roles leave a school; never names, phones, emails or locations | Children's data stays with the school. The allow-list runs on both sides. |
| Colour | No purple/blue "AI" palette. School app: green accent with teal (not indigo) for leave/info. Console: warm "ledger" palette with natural-pigment status colours, each paired with a shape and a word | User request: colour that feels human, chosen with care. |

Earlier ideas that were dropped: storing data in Excel files (replaced by Google Sheets at
the user's request), and a "laptop hub" mode where the Windows app runs the API offline
(not needed while storage is an online spreadsheet).

---

## 2. The previous ERP, in brief

Location at the time of writing: `/home/paras/Documents/Projects/ERP` (Next.js 15, React 19,
TypeScript, Tailwind; Google Sheets as the database).

How it worked:

1. A visitor picked one of 12 industry templates on the landing page and sent an enquiry.
2. A single **superadmin** (credentials in environment variables) accepted it at `/admin/enquiries`.
3. `provisionTenant()` wrote a tenant into **one shared spreadsheet** (13 tabs, every row
   tagged with `tenantId`): roles from the template, role→capability grants, sample users,
   reporting lines, features and branding. It returned an invite link.
4. The tenant admin set a password from the invite and used `/portal/<slug>`: Dashboard,
   People (add/edit/archive), Roles (read-only), Hierarchy (read-only), Attendance.
5. Separately, `/demo/<template>` was a browser-only sandbox (localStorage) that was in some
   ways ahead of the real portal (editable permission matrix, departments, branding).

Its permission model, which this project keeps in a corrected form:

```
user → user_roles → role → role_grants → capability + scope
                     then per-person overrides (GRANT / REVOKE; REVOKE wins)
scope rank: SELF < DIRECT_REPORTS < ORG_UNIT < DOWNLINE < TENANT
```

It also carried a legacy Excel layer (`lib/excel/excelService.ts` and 11 API routes) that
nothing in the UI used, plus unused modules for Cloudinary uploads and Resend email.

### What was carried over

| From the old ERP | Here |
|---|---|
| Capability catalogue + role grants + "power comes from roles, never from a code" | `packages/core/src/capabilities.ts`, `defaults.ts`, `permissions.ts`, now with **reach checked against the target** |
| Header-driven Sheets adapter (column list as single source of truth, cache, retry on 429) | `packages/core/src/tables.ts` + `apps/api/src/store/sheets.ts`, plus batch reads, a write lock and header validation |
| Invite link → set password → session; separate token kinds | `apps/api/src/auth/*`, with audiences per token kind and a password fingerprint in the session |
| Demo-sandbox screens as a design reference | Redesigned; see `DESIGN.md` |

Not carried over: the multi-industry templates, enquiry funnel, superadmin console,
multi-tenant `tenantId` scheme, the Excel layer, and the unused upload/email modules.

---

## 3. Problems found in the old ERP and how this project prevents them

Line numbers refer to the old repository as it was on 24 Nov 2026. Each fix has a test
that fails if the problem returns.

| # | Problem in the old ERP | Fix here | Test |
|---|---|---|---|
| 1 | **Acting as someone else.** `app/api/attendance/route.ts:94` and `:205` ran the permission check against an `actorId` taken from the request body, so any signed-in member of a tenant could act as its admin. | The actor is built from the session on every request (`auth/middleware.ts`, `context.ts → loadActor`). Every request schema is strict, so `actorId`, `markedBy` or `userId` in a body is rejected. | `security.test.ts`: "rejects an actorId or markedBy field outright"; `staffAttendance.test.ts`: "cannot check in on behalf of someone else" |
| 2 | **Scope never checked against the record.** `can()` (`lib/permissions/can.ts:160`) compared scope ranks only, so `DOWNLINE` behaved like `TENANT`. | `can(actor, capability, TARGET, grants)` asks whether the grant's reach covers that specific section/student/user (`packages/core/src/permissions.ts`). Lists are filtered record by record. | `permissions.test.ts`; `security.test.ts`: "old ERP #2" block |
| 3 | **Over-sharing.** The portal endpoint (`app/api/portal/[tenant]/route.ts:28`) returned every person's email, phone and attendance to anyone signed in; `people.user.read` only hid a tab. | Every endpoint returns only records the caller can reach. Student lists mask guardian phones; full numbers only on a profile the caller may view. Out-of-reach records are 404, not 403. | `security.test.ts`: "masks guardian phone numbers…", "another class's student is a 404" |
| 4 | **Routes with no login check.** 15 routes (the Excel layer, `tenants/init` which wrote files, and four email routes usable as an open relay). | Deny by default: one middleware guards all of `/api/*`; the only public routes are listed in `PUBLIC_ROUTES`. | `security.test.ts`: "old ERP #4" (every route, including one "added later") |
| 5 | **Forgeable admin login.** `lib/auth/superadminAuth.ts:31` fell back to a hard-coded JWT secret when `NEXTAUTH_SECRET` was missing. | `config.ts` refuses to start without a 32+ character secret, rejects placeholders, and refuses demo logins in production. | `config.test.ts` |
| 6 | **Double processing.** Accepting an enquiry checked status, then provisioned, with nothing in between (`app/api/enquiries/[id]/route.ts:37`); a double click could provision twice. | Every read-check-write runs inside `store.exclusive()` (a per-process lock). One API process per spreadsheet. | `security.test.ts`: "two saves at once still make one record" |
| – | Login email compared case-sensitively (`lib/auth/tenantAuth.ts:153`). | Emails stored lower-case and compared case-insensitively. | "ignores email case…" |
| – | Archived users kept a working session for up to 12 h. | Account status and a password fingerprint are re-checked on every request. | "suspending someone ends their session immediately" |

### UI problems found (the "before" screen on the design canvas)

1. Staff and students in one flat attendance list, no class/section filter.
2. Five buttons per row and one save per click (about 40 requests for a class of 40,
   enough to hit the Sheets quota at 9 AM). Now: one save per class.
3. Header showed the URL slug, not the school's name or logo.
4. Emoji icons (render differently on Windows) and a top tab bar that can't hold a
   school's 12+ modules. Now: inline SVG icons, grouped sidebar.
5. Role colour dots invisible for 11 of 18 roles: colours were stored as Tailwind class
   names in the sheet, and Tailwind never generated classes it couldn't see in source.
   Now: colours are CSS variables only.
6. Grey labels at about 2.6:1 contrast. Now the lightest text colour is 5.6:1.
7. No saved state, no sync indicator, no undo; native `confirm()`/`prompt()` dialogs;
   invite links shown as raw text with no copy button; read-only roles screen; hierarchy
   tree meaningless for students; dashboard counted people and roles instead of what a
   principal checks each morning.

---

## 4. Where things stand

Built (v0.1):
- Sign-in, invites, sessions (web cookie / Windows bearer), suspension takes effect at once.
- Roles & access matrix with reach, protected against lock-out.
- Classes, sections, class teachers, subject teachers.
- Students: list (reach-filtered, masked phones), profile, add/edit, guardians.
- Student attendance: one save per class, past-day amendments need their own permission,
  audit trail.
- Geofenced staff check-in/out, attendance zones, staff attendance view, late marking.
- Dashboard, school settings, demo school for development.
- Windows app shell (Tauri 2).

Not built yet: see `ROADMAP.md`.

Design canvas (private until shared from its Share menu):
https://claude.ai/artifact/U9YuXsmGCq9Yrw9uJ9B3iC — copies of its source are in
`docs/design/`. Four of its screens (Attendance, Students, Fees, Roles) were written but not
yet published to the canvas when this file was written.
