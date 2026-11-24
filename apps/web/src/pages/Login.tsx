import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorText, setToken } from '../lib/api';
import { initials } from '../lib/format';
import { useAccent } from '../lib/session';
import { Notice } from '../components/ui';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const school = useQuery({ queryKey: ['school'], queryFn: () => api<{ schoolName: string; accentColor: string }>('/api/school') });
  useAccent(school.data?.accentColor);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
      setToken(res.token);
      qc.clear();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card auth-card" onSubmit={submit}>
        <div className="row-center">
          <div className="crest" aria-hidden="true">
            {initials(school.data?.schoolName ?? 'School') || 'S'}
          </div>
          <p className="strong">{school.data?.schoolName ?? 'School ERP'}</p>
        </div>
        <h1>Sign in</h1>
        {error && <Notice tone="bad">{error}</Notice>}
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-big" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="small muted">New here? Use the invite link the school office sent you to set your password.</p>
        {import.meta.env.DEV && (
          <Notice tone="info">
            Demo logins (development only): <strong>principal@demo.school</strong>, <strong>office@demo.school</strong>,{' '}
            <strong>teacher@demo.school</strong>, <strong>accounts@demo.school</strong>. Password <strong>Demo@12345</strong>.
          </Notice>
        )}
      </form>
    </div>
  );
}
