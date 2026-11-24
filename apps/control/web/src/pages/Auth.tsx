import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../lib/api';
import { Notice, Spinner } from '../components/ui';

function Mark() {
  return (
    <div className="row-c">
      <div className="mark-tile" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFCF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10 12 4l9 6" />
          <path d="M5 9.5V20h14V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      </div>
      <p className="serif strong" style={{ fontSize: 18 }}>Control room</p>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
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
        <Mark />
        <h1>Sign in</h1>
        <p className="muted">For the team that runs the school network. School staff sign in to their own school's app.</p>
        {error && <Notice tone="alert">{error}</Notice>}
        <label className="field">Email<input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Password<input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {import.meta.env.DEV && (
          <Notice tone="calm">
            Demo (development only): <strong>owner@control.demo</strong> or <strong>viewer@control.demo</strong>, password <strong>Demo@12345</strong>.
          </Notice>
        )}
      </form>
    </div>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ name: string; email: string; role: string }>(`/api/auth/invite?token=${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords are different.');
    setBusy(true);
    try {
      await api('/api/auth/accept-invite', { method: 'POST', body: { token, password } });
      qc.clear();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card auth-card" onSubmit={submit}>
        <Mark />
        <h1>Set your password</h1>
        {invite.isPending && token && <Spinner label="Checking your invite" />}
        {(!token || invite.error) && (
          <>
            <Notice tone="alert">{token ? errorText(invite.error) : 'This link is missing its invite code.'}</Notice>
            <Link to="/login">Go to sign in</Link>
          </>
        )}
        {invite.data && (
          <>
            <p>Welcome, {invite.data.name}. You'll sign in as <strong>{invite.data.email}</strong> ({invite.data.role === 'OWNER' ? 'owner' : 'viewer'}).</p>
            {error && <Notice tone="alert">{error}</Notice>}
            <label className="field">New password <span className="hint">At least 8 characters</span><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <label className="field">Type it again<input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Set password and continue'}</button>
          </>
        )}
      </form>
    </div>
  );
}
