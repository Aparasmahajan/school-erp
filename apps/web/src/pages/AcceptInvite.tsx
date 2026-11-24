import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText, setToken } from '../lib/api';
import { Notice, Spinner } from '../components/ui';

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ name: string; email: string; schoolName: string }>(`/api/auth/invite?token=${encodeURIComponent(token)}`),
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
    setError('');
    try {
      const res = await api<{ token: string }>('/api/auth/accept-invite', { method: 'POST', body: { token, password } });
      setToken(res.token);
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
        <h1>Set your password</h1>
        {!token && <Notice tone="bad">This link is missing its invite code. Open the full link from your message.</Notice>}
        {invite.isPending && token && <Spinner label="Checking your invite" />}
        {invite.error && (
          <>
            <Notice tone="bad">{errorText(invite.error)}</Notice>
            <Link to="/login">Go to sign in</Link>
          </>
        )}
        {invite.data && (
          <>
            <p>
              Welcome to <strong>{invite.data.schoolName}</strong>, {invite.data.name}. You'll sign in as <strong>{invite.data.email}</strong>.
            </p>
            {error && <Notice tone="bad">{error}</Notice>}
            <label className="field">
              New password <span className="hint">At least 8 characters</span>
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label className="field">
              Type it again
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            <button className="btn btn-primary btn-big" disabled={busy}>
              {busy ? 'Saving…' : 'Set password and continue'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
