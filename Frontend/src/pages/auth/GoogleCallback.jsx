import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeGoogleProfile, finishGoogleLogin } from '../../services/authService.js';
import './GoogleCallback.css';

const messages = {
  configuration: 'Google login is not configured yet. Please use email and password for now.',
  existing_account: 'An account with this email already exists. Sign in using your password. Google accounts are not linked by email alone.',
  account_conflict: 'An account already exists. Please try signing in again or use your existing password.',
  permission: 'Google login is available only for active parent accounts. Admins must use password login.',
  identity: 'Google could not provide a verified identity supported by this account. Please use another account.',
  authentication: 'Google sign-in was cancelled or could not be verified. Please try again.',
};

export default function GoogleCallback() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    const providerError = new URLSearchParams(window.location.search).get('error');
    if (providerError) {
      setError(messages[providerError] || messages.authentication);
      return;
    }
    finishGoogleLogin().then(result => {
      if (!active) return;
      if (result.new_user) setReady(true);
      else navigate('/parent/home', { replace: true });
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [navigate]);

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await completeGoogleProfile(phone);
      navigate('/parent/home', { replace: true });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  return <main className="google-profile"><section aria-busy={saving || (!ready && !error)}>
    <h1>{ready ? 'Complete Your Profile' : 'Google sign-in'}</h1>
    {ready ? <form onSubmit={save}>
      <label htmlFor="google-phone">Phone number (optional)</label>
      <input id="google-phone" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={20} placeholder="0771234567" aria-describedby={error ? 'google-error' : undefined} />
      <div><button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Continue'}</button>
        <button type="button" disabled={saving} onClick={() => navigate('/parent/home', { replace: true })}>Skip</button></div>
    </form> : !error && <p role="status">Completing Google sign-in...</p>}
    {error && <p id="google-error" role="alert">{error}</p>}
    {!ready && error && <Link to="/login">Back to Login</Link>}
  </section></main>;
}
