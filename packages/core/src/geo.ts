/**
 * Geofence maths for staff check-in. Used by the browser (to unlock the Check in button)
 * and by the server (to decide). The server's answer is the one that counts.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Zone extends LatLng {
  id: string;
  name: string;
  radiusM: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). Accurate to well under a metre at campus scale. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  );
}

export type ZoneCheck =
  | { ok: true; zone: Zone; distanceM: number; accuracyM: number }
  | {
      ok: false;
      reason: 'NO_ZONES' | 'INACCURATE' | 'OUTSIDE' | 'BAD_POINT';
      accuracyM: number;
      maxAccuracyM: number;
      /** Nearest zone and how far outside its edge the point is. */
      nearest?: Zone;
      outsideByM?: number;
    };

/**
 * Is `point` inside one of `zones`?
 *
 * Accuracy is checked FIRST: a reading of "±800 m" can't tell inside from outside, so it is
 * rejected rather than given the benefit of the doubt. Set zone radii to cover the campus
 * plus a margin instead.
 */
export function checkZones(point: LatLng, accuracyM: number, zones: Zone[], maxAccuracyM: number): ZoneCheck {
  const base = { accuracyM: Math.round(accuracyM), maxAccuracyM };
  if (!isValidLatLng(point) || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return { ok: false, reason: 'BAD_POINT', ...base };
  }
  if (zones.length === 0) return { ok: false, reason: 'NO_ZONES', ...base };

  const measured = zones
    .map((zone) => ({ zone, d: distanceMeters(point, zone) }))
    .sort((a, b) => a.d - b.d); // nearest centre first

  if (accuracyM > maxAccuracyM) {
    return { ok: false, reason: 'INACCURATE', ...base, nearest: measured[0].zone };
  }

  const inside = measured.filter((m) => m.d <= m.zone.radiusM).sort((a, b) => a.d - b.d)[0];
  if (inside) return { ok: true, zone: inside.zone, distanceM: Math.round(inside.d), accuracyM: base.accuracyM };

  const nearestEdge = measured
    .map((m) => ({ ...m, outside: m.d - m.zone.radiusM }))
    .sort((a, b) => a.outside - b.outside)[0];
  return {
    ok: false,
    reason: 'OUTSIDE',
    ...base,
    nearest: nearestEdge.zone,
    outsideByM: Math.max(1, Math.round(nearestEdge.outside)),
  };
}

/**
 * Pulls coordinates out of a pasted Google Maps link or a "lat, lng" string, so an admin
 * can set a zone from Maps without typing decimals.
 */
export function parseLatLng(input: string): LatLng | null {
  const text = input.trim();
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // .../@26.9124,75.7873,17z
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ?q=26.9,75.7
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // data=!3d26.9!4d75.7
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/, // 26.9124, 75.7873
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const p = { lat: Number(m[1]), lng: Number(m[2]) };
      if (isValidLatLng(p)) return p;
    }
  }
  return null;
}
