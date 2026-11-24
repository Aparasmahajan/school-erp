import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from './api';
import type { Me } from './types';
import { Spinner } from '../components/ui';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), retry: false, staleTime: 60_000 });
}

export function useIsOwner(): boolean {
  return useMe().data?.admin.role === 'OWNER';
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <div className="center-screen"><Spinner /></div>;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }
    return (
      <div className="center-screen">
        <div className="card stack" style={{ maxWidth: 420 }}>
          <p className="strong">The console can't load.</p>
          <p className="muted">{me.error.message}</p>
          <button className="btn" onClick={() => me.refetch()}>Try again</button>
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
    qc.clear();
    navigate('/login', { replace: true });
  };
}
