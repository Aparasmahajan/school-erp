import { describe, expect, it } from 'vitest';
import { checkZones, distanceMeters, parseLatLng, type Zone } from '../src';

const campus: Zone = { id: 'z1', name: 'Main campus', lat: 26.9124, lng: 75.7873, radiusM: 150 };

describe('distanceMeters', () => {
  it('measures 0.001° of latitude as about 111 m', () => {
    const d = distanceMeters({ lat: 26.9124, lng: 75.7873 }, { lat: 26.9134, lng: 75.7873 });
    expect(d).toBeGreaterThan(110.7);
    expect(d).toBeLessThan(111.7);
  });
});

describe('checkZones', () => {
  it('accepts a precise reading inside the circle', () => {
    const r = checkZones({ lat: 26.9130, lng: 75.7873 }, 20, [campus], 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.zone.id).toBe('z1');
  });

  it('refuses a point outside and says how far out it is', () => {
    const r = checkZones({ lat: 26.9154, lng: 75.7873 }, 20, [campus], 100); // ~334 m north
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('OUTSIDE');
      expect(r.outsideByM).toBeGreaterThan(170);
      expect(r.outsideByM).toBeLessThan(200);
    }
  });

  it('refuses an imprecise reading even when the centre is inside', () => {
    const r = checkZones({ lat: 26.9124, lng: 75.7873 }, 500, [campus], 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INACCURATE');
  });

  it('reports when no zone is set up', () => {
    const r = checkZones({ lat: 26.9124, lng: 75.7873 }, 10, [], 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_ZONES');
  });

  it('rejects impossible coordinates', () => {
    const r = checkZones({ lat: 120, lng: 75 }, 10, [campus], 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('BAD_POINT');
  });

  it('picks the zone that contains the point when there are several', () => {
    const annexe: Zone = { id: 'z2', name: 'Annexe', lat: 26.95, lng: 75.8, radiusM: 100 };
    const r = checkZones({ lat: 26.9501, lng: 75.8 }, 15, [campus, annexe], 100);
    expect(r.ok && r.zone.id).toBe('z2');
  });
});

describe('parseLatLng', () => {
  it('reads Google Maps links and plain pairs', () => {
    expect(parseLatLng('https://www.google.com/maps/@26.9124,75.7873,17z')).toEqual({ lat: 26.9124, lng: 75.7873 });
    expect(parseLatLng('https://maps.google.com/?q=26.9124,75.7873')).toEqual({ lat: 26.9124, lng: 75.7873 });
    expect(parseLatLng('26.9124, 75.7873')).toEqual({ lat: 26.9124, lng: 75.7873 });
    expect(parseLatLng('somewhere nice')).toBeNull();
  });
});
