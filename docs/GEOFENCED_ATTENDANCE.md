# Geofenced staff attendance

Staff check in and out from their phone or laptop. The check is accepted only when the
device reports a location inside an **attendance zone** the school has set up.

## How it works

1. An admin with *Set attendance zones* opens **Attendance zones** and adds a circle:
   a centre (stand on campus and press **Use my current location**, paste a Google Maps
   link, or type coordinates) and a radius (20 m – 5 km). A school can have several zones
   (main campus, annexe, sports ground) and switch them on or off.
2. A member of staff opens **My check-in**. The browser asks for location permission and
   then follows the device's position.
3. The screen compares the position with the zones **on the device** and unlocks
   **Check in** / **Check out** only when inside one with good enough accuracy. It explains
   any problem: permission off, not precise enough, or "about 340 m outside Main campus".
4. Pressing the button sends latitude, longitude and accuracy. **The server repeats the
   check** with its own zone list and accuracy limit, and records the time from its own
   clock. The device's verdict and clock are never trusted.
5. Check-ins after the school's *staff start time* are marked late. The office sees
   everyone's check-ins on **Staff attendance**, with zone, distance from the centre,
   accuracy and a map link.

## Rules the server applies (`packages/core/src/geo.ts`, `apps/api/src/routes/staffAttendance.ts`)

- Readings less precise than *Location accuracy needed* (default ±100 m) are refused
  first. A ±800 m reading can't tell inside from outside, so it gets no benefit of the doubt.
- Inside means the distance to a zone's centre (haversine) is at most its radius.
- One check-in and one check-out per person per school day. Check-out needs a check-in.
- Only `staff_attendance.mark` at reach `SELF`: you can check in only yourself; a body
  containing `userId` is rejected.
- Each check-in and check-out writes an audit row (zone, distance, accuracy).

## Privacy

Location is read only while **My check-in** is open, and stored only with each check-in or
check-out (coordinates, accuracy, distance). It isn't tracked at any other time. Teachers
see only their own records by default; *See staff check-ins* at *Whole school* is needed to
see everyone's.

## Limits — what this does and doesn't prove

Geofencing stops casual "check in from home". It is **not proof of presence**:

- A browser can be given a fake location (developer tools, mock-GPS apps on Android).
- Indoors, phones often report 20–50 m off; laptops without GPS use Wi-Fi positioning,
  which can be 50–500 m off. Set radii to cover the campus plus a margin, and keep the
  accuracy limit realistic.
- Location only works over **HTTPS** (or `localhost` during development).

What helps today: the office can review distance, accuracy and the map link for each
check-in. Readings with accuracy of exactly 0 or identical coordinates every day are signs
of spoofing worth a look.

Stronger options for later (in order of effort):
1. Flag suspicious readings automatically (zero accuracy, identical coordinates, check-ins
   from two zones far apart within minutes).
2. A selfie at check-in, stored with the record.
3. In the Windows app, read the connected Wi-Fi network (BSSID) through a small Tauri
   plugin and require the school's network as well as the zone.
4. Bind each account to one registered device.

## Windows notes

- Windows must have **Settings › Privacy & security › Location** on, and "Let desktop apps
  access your location" allowed.
- The Windows app uses WebView2. Check on a real Windows machine that WebView2 shows its
  location permission prompt for the app; if it doesn't, handle the permission request in
  `src-tauri/src/main.rs` (WebView2's `PermissionRequested` event). This has not been
  tested yet.
- Most staff will check in from their phones' browsers; the Windows app matters more for
  the office.

## Setting it up for a school

1. Sign in as the principal or office admin, open **Attendance zones**, **Add zone**.
2. Stand in the middle of the campus with a phone, press **Use my current location**.
3. Set the radius to cover the buildings and gate, plus 30–50 m. Save.
4. In **School settings**, set *Staff start time* and, if needed, *Location accuracy needed*.
5. Ask one teacher to try **My check-in** at the gate and at the far end of the campus.
