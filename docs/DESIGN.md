# Design

## Look: "calm ledger"

Cool neutral ground, ink text, one accent colour the school chooses (School settings).
Built for office staff on Windows laptops and teachers on phones: large touch targets
(44 px minimum), plain language, everything readable in daylight.

| Token | Value | Use |
|---|---|---|
| `--accent` | school's colour, default `#13795B` | primary buttons, active menu item, present marks, charts |
| `--bg` / `--surface` | `#F5F6F8` / `#FFFFFF` | page / cards |
| `--text` / `--text-2` / `--muted` | `#14202E` / `#3A4654` / `#5E6977` | text; `--muted` is the lightest text colour (5.6:1 on white) |
| `--bad-*` | orange family | absent, overdue, outside the zone |
| `--warn-*` | amber family | late, not marked, imprecise location |
| `--info-*` | teal family (`#22504D` on `#DCEBE8`) | leave, informational notices (deliberately not indigo/purple) |

Type: Plus Jakarta Sans (bundled, works offline), tabular numerals for figures.
Icons: inline SVG, never emoji. Colours that must be told apart also differ in lightness
(e.g. Present is a light tint, Absent is solid dark orange), and every status also has a
word.

All tokens live in `apps/web/src/styles.css`. Never store colours or class names in data.

## Screens

| Screen | Who | Notes |
|---|---|---|
| Dashboard | everyone | Only shows what the person can reach: attendance %, sections not marked, absence streaks, staff in, own check-in |
| Attendance | class teachers, office | Everyone starts Present; tap the exceptions; one save for the class; past days marked as amendments |
| Students | per reach | Filters, masked phones in the list, profile panel, add/edit with guardians |
| My check-in | staff | Live location status, zone sketch, buttons unlock inside a zone |
| Staff attendance | principal, office | Who's in, late, where |
| Attendance zones | principal, office | Use current location / paste Maps link / radius slider, preview |
| Staff | principal, office | Invite with copyable link, roles, suspend |
| Classes & sections | principal, office | Class teacher and subject teacher assignment |
| Roles & access | principal | Matrix of capability × role; each cell is a reach |
| School settings | principal, office | Name, time zone, year start, colour, start time, location accuracy |

## Control console look: "ledger"

A separate product for the vendor's team, so it has its own look, chosen to feel like a
well-kept register rather than a generic dashboard (no purple or blue):

| Token | Value | Use |
|---|---|---|
| ground / paper | `#F2EDE4` / `#FFFCF6` | warm limestone page, paper cards |
| ink / muted | `#221E19` / `#6B6155` | text (muted is 5.9:1 on paper) |
| brand | terracotta `#B4532A` | logo tile, active page marker, focus ring, links |
| action | ink `#2A251F` | primary buttons |
| moss | `#5B8A4D` | live / healthy (filled dot) |
| turmeric | `#C08423` | quiet / needs a look (half dot) |
| brick | `#8F2F25` | offline / errors (ring with bar) |
| teal | `#2C6662` | being set up (dashed ring) |
| stone | `#8A8073` | paused (two bars) |
| activity grid | six moss steps from `#EBE4D8` to `#3F6E3A` | events per day |

Type: Fraunces (headings, big numbers) with Source Sans 3 (text), both bundled. Every status
uses colour, shape and word together; healthy vs problem also differ strongly in lightness.
Tokens: `apps/control/web/src/styles.css`.

## Design canvas

https://claude.ai/artifact/U9YuXsmGCq9Yrw9uJ9B3iC (private until shared from its Share menu)

It holds the "before" screen (the old portal's attendance tab, recreated from its code, with
notes on what needed fixing) and the proposed screens. Source copies are in `docs/design/`:
`Current`, `Main` (dashboard), `Attendance`, `Students`, `Fees`, `Roles`, `Sidebar`. The
Attendance, Students, Fees and Roles screens were written but not yet published to the
canvas. Fees is designed but not built (see ROADMAP).
