import { useEffect, useState } from 'react';

export interface GeoReading {
  lat: number;
  lng: number;
  accuracyM: number;
  at: number;
}

export type GeoStatus = 'idle' | 'insecure' | 'unsupported' | 'locating' | 'ready' | 'denied' | 'error';

export interface GeoState {
  status: GeoStatus;
  reading?: GeoReading;
  message?: string;
}

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 };

/**
 * Follows the device's location while `active`. Browsers only allow this on HTTPS (or
 * localhost) and only after the person agrees, so every refusal is reported with a reason
 * the screen can explain.
 */
export function useGeolocation(active: boolean): GeoState & { retry: () => void } {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (!window.isSecureContext) {
      setState({ status: 'insecure' });
      return;
    }
    if (!('geolocation' in navigator)) {
      setState({ status: 'unsupported' });
      return;
    }
    setState((s) => (s.reading ? s : { status: 'locating' }));
    const id = navigator.geolocation.watchPosition(
      (p) =>
        setState({
          status: 'ready',
          reading: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: p.timestamp },
        }),
      (err) =>
        setState((s) => {
          if (err.code === err.PERMISSION_DENIED) return { status: 'denied', message: err.message };
          // A timeout after a good reading keeps the last reading on screen.
          return s.reading ? s : { status: 'error', message: err.message };
        }),
      OPTIONS
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** One reading, for "use my current location" buttons. */
export function currentPosition(): Promise<GeoReading> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error('Location only works over HTTPS.'));
    if (!('geolocation' in navigator)) return reject(new Error('This device does not share its location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: p.timestamp }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was refused.' : err.message)),
      OPTIONS
    );
  });
}

/** Metres east (x) and north (y) of `origin`. Fine at campus scale. */
export function offsetMeters(origin: { lat: number; lng: number }, p: { lat: number; lng: number }) {
  const x = (p.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180) * 111_320;
  const y = (p.lat - origin.lat) * 110_574;
  return { x, y };
}
