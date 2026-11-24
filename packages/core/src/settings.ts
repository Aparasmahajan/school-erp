/** School-wide settings, stored as key/value rows in the `settings` table. */
export interface SchoolSettings {
  schoolName: string;
  timezone: string;
  /** Attendance percentages count from this date. */
  academicYearStart: string;
  accentColor: string;
  /** Staff checking in after this time (school time zone) are marked late. */
  staffStartTime: string;
  /** Location readings less precise than this are refused. */
  geoMaxAccuracyM: number;
}

export const SETTING_KEYS = [
  'schoolName',
  'timezone',
  'academicYearStart',
  'accentColor',
  'staffStartTime',
  'geoMaxAccuracyM',
] as const satisfies readonly (keyof SchoolSettings)[];

export function defaultSettings(now: Date = new Date()): SchoolSettings {
  // Indian academic years start in April.
  const year = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    schoolName: 'My School',
    timezone: 'Asia/Kolkata',
    academicYearStart: `${year}-04-01`,
    accentColor: '#13795B',
    staffStartTime: '08:00',
    geoMaxAccuracyM: 100,
  };
}

export function settingsFromRows(rows: { id: string; value: string }[], fallback: SchoolSettings): SchoolSettings {
  const map = new Map(rows.map((r) => [r.id, r.value]));
  const num = Number(map.get('geoMaxAccuracyM'));
  return {
    schoolName: map.get('schoolName') || fallback.schoolName,
    timezone: map.get('timezone') || fallback.timezone,
    academicYearStart: map.get('academicYearStart') || fallback.academicYearStart,
    accentColor: map.get('accentColor') || fallback.accentColor,
    staffStartTime: map.get('staffStartTime') || fallback.staffStartTime,
    geoMaxAccuracyM: Number.isFinite(num) && num > 0 ? num : fallback.geoMaxAccuracyM,
  };
}
