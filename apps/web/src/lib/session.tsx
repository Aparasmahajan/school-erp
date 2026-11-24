import { useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { CapabilityId } from '@school/core/browser';
import { api, ApiError, setToken } from './api';
import type { Me } from './types';
import { Spinner } from '../components/ui';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false, staleTime: 60_000 });
}

/**
 * What the signed-in person may do, for showing and hiding screens and buttons. This is a
 * convenience only: the server checks every action against the actual record.
 */
export function useAccess() {
  const { data } = useMe();
  const access = data?.access ?? {};
  return {
    can: (cap: CapabilityId) => (access[cap]?.length ?? 0) > 0,
    schoolWide: (cap: CapabilityId) => access[cap]?.includes('SCHOOL') ?? false,
  };
}

/** Paints the school's chosen colour through the whole app. */
export function useAccent(color: string | undefined) {
  useEffect(() => {
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) document.documentElement.style.setProperty('--accent', color);
  }, [color]);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <div className="center-screen">
        <Spinner label="Loading" />
      </div>
    );
  }
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }
    return (
      <div className="center-screen">
        <div className="card stack" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20 }}>Can't load the app</h1>
          <p className="muted">{me.error.message}</p>
          <button className="btn" onClick={() => me.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    // Shared office computers: drop every cached record from the previous person.
    qc.clear();
    navigate('/login', { replace: true });
  };
}
