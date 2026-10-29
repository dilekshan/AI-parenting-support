import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { validateAccountSecurity } from '../../services/registrationValidation.js';
import { requestPasswordReset, verifyPasswordReset } from '../../services/passwordRecoveryService.js';
import reference from '../../assets/images/login-reference.png';
import './Login.css';

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

export default function ForgotPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const pending = useRef(false);
  const [stage, setStage] = useState('password');
  const [passwords, setPasswords] = useState({ newPassword: '', confirmNewPassword: '' });
  const [visiblePasswords, setVisiblePasswords] = useState({ newPassword: false, confirmNewPassword: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [lockedUntil, setLockedUntil] = useState(0);

  useEffect(() => {
    if (stage !== 'otp') return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stage]);

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return <Navigate to="/login" replace />;
  }

  const recoveryLocked = lockedUntil > clock;
  const sendLimited = Boolean(challenge?.sendUnlockAt > clock);
  const unlockSeconds = Math.max(0, Math.ceil((Math.max(lockedUntil, challenge?.sendUnlockAt || 0) - clock) / 1000));
  const limitMessage = 'You have reached the OTP limit. Please try again after 24 hours.';

  function reportError(error) {
    if (error.message.startsWith(limitMessage)) {
      const seconds = Number(error.message.match(/Try again in (\d+) seconds/)?.[1] || 86400);
      setLockedUntil(Date.now() + seconds * 1000);
    }
    setNotice(error.message);
  }

  const cooldownSeconds = challenge ? Math.max(0, Math.ceil((challenge.nextSendAt - clock) / 1000)) : 0;
  const expiresSeconds = challenge ? Math.max(0, Math.ceil((challenge.expiresAt - clock) / 1000)) : 0;

  function clearSensitiveState() {
    setPasswords({ newPassword: '', confirmNewPassword: '' });
    setOtp('');
    setChallenge(null);
    setFieldErrors({});
    setNotice('');
  }

  function cancel(event) {
    event.preventDefault();
    clearSensitiveState();
    navigate('/login', { replace: true });
  }

  function changePassword(event) {
    const { name, value } = event.target;
    setPasswords(previous => ({ ...previous, [name]: value }));
    setFieldErrors(previous => ({ ...previous, [name === 'newPassword' ? 'password' : 'confirm']: undefined }));
    setNotice('');
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (pending.current || busy) return;
    const errors = validateAccountSecurity({
      password: passwords.newPassword,
      confirm: passwords.confirmNewPassword,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      event.currentTarget.elements.namedItem(errors.password ? 'newPassword' : 'confirmNewPassword')?.focus();
      return;
    }

    pending.current = true;
    setBusy(true);
    setNotice('Requesting a verification code...');
    try {
      const result = await requestPasswordReset(email);
      if (typeof result.challenge_id !== 'string' || !Number.isInteger(result.expires_in) || !Number.isInteger(result.retry_after)) {
        throw new Error('Invalid password reset response. Please try again.');
      }
      const now = Date.now();
      setChallenge({
        id: result.challenge_id,
        expiresAt: now + result.expires_in * 1000,
        nextSendAt: now + result.retry_after * 1000,
        sendUnlockAt: result.send_limit_retry_after ? now + result.send_limit_retry_after * 1000 : 0,
      });
      setOtp('');
      setClock(now);
      setStage('otp');
      setNotice(result.message);
    } catch (error) {
      reportError(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function resendCode() {
    if (pending.current || busy || !challenge || cooldownSeconds > 0 || expiresSeconds > 0 || recoveryLocked || sendLimited) return;
    pending.current = true;
    setBusy(true);
    setNotice('Requesting another verification code...');
    try {
      const result = await requestPasswordReset(email, challenge.id);
      if (typeof result.challenge_id !== 'string' || !Number.isInteger(result.expires_in) || !Number.isInteger(result.retry_after)) {
        throw new Error('Invalid password reset response. Please try again.');
      }
      const now = Date.now();
      setChallenge({
        id: result.challenge_id,
        expiresAt: now + result.expires_in * 1000,
        nextSendAt: now + result.retry_after * 1000,
        sendUnlockAt: result.send_limit_retry_after ? now + result.send_limit_retry_after * 1000 : 0,
      });
      setOtp('');
      setClock(now);
      setNotice(result.message);
    } catch (error) {
      reportError(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function submitOtp(event) {
    event.preventDefault();
    if (pending.current || busy || !challenge || recoveryLocked) return;
    if (expiresSeconds <= 0) {
      setNotice('This code has expired. Request a new code to continue.');
      return;
    }
    if (!/^[0-9]{6}$/.test(otp)) {
      setNotice('Enter the 6-digit verification code.');
      return;
    }

    pending.current = true;
    setBusy(true);
    setNotice('Verifying code...');
    try {
      const result = await verifyPasswordReset({
        challengeId: challenge.id,
        otp,
        newPassword: passwords.newPassword,
        confirmNewPassword: passwords.confirmNewPassword,
      });
      clearSensitiveState();
      navigate('/login', {
        replace: true,
        state: { passwordResetMessage: result.message || 'Password updated. You can now sign in.' },
      });
    } catch (error) {
      reportError(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="juv-login">
      <section className="juv-login__card" aria-label="JuvCare password reset">
        <div className="juv-login__art">
          <img src={reference} alt="A mother and child sharing a loving moment" />
        </div>
        <div className="juv-login__panel">
          {stage === 'password' ? <>
            <div className="juv-login__heading">
              <h1>Reset Password</h1>
              <p>For {maskEmail(email)}</p>
            </div>
            <form onSubmit={submitPassword} noValidate aria-busy={busy}>
              <label className="juv-login__sr-only" htmlFor="reset-new-password">New Password</label>
              <div className="juv-login__email juv-login__password">
                <input id="reset-new-password" name="newPassword" type={visiblePasswords.newPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="New Password" value={passwords.newPassword} onChange={changePassword} aria-invalid={Boolean(fieldErrors.password)} required disabled={busy} />
                <button type="button" aria-label={`${visiblePasswords.newPassword ? 'Hide' : 'Show'} new password`} aria-pressed={visiblePasswords.newPassword} onClick={() => setVisiblePasswords(previous => ({ ...previous, newPassword: !previous.newPassword }))} disabled={busy}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visiblePasswords.newPassword && <path d="m3 3 18 18"/>}</svg>
                </button>
              </div>
              {fieldErrors.password && <p className="juv-login__notice" role="alert">{fieldErrors.password}</p>}
              <label className="juv-login__sr-only" htmlFor="reset-confirm-password">Confirm New Password</label>
              <div className="juv-login__email juv-login__password">
                <input id="reset-confirm-password" name="confirmNewPassword" type={visiblePasswords.confirmNewPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm New Password" value={passwords.confirmNewPassword} onChange={changePassword} aria-invalid={Boolean(fieldErrors.confirm)} required disabled={busy} />
                <button type="button" aria-label={`${visiblePasswords.confirmNewPassword ? 'Hide' : 'Show'} confirm new password`} aria-pressed={visiblePasswords.confirmNewPassword} onClick={() => setVisiblePasswords(previous => ({ ...previous, confirmNewPassword: !previous.confirmNewPassword }))} disabled={busy}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visiblePasswords.confirmNewPassword && <path d="m3 3 18 18"/>}</svg>
                </button>
              </div>
              {fieldErrors.confirm && <p className="juv-login__notice" role="alert">{fieldErrors.confirm}</p>}
              <button className="juv-login__submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Update Password'}</button>
              <p className="juv-login__notice" role="status">{notice}</p>
            </form>
          </> : <>
            <div className="juv-login__heading">
              <h1>Verify Your Email</h1>
              <p>Enter the 6-digit code sent to {maskEmail(email)}</p>
            </div>
            <form onSubmit={submitOtp} noValidate aria-busy={busy}>
              <label className="juv-login__sr-only" htmlFor="reset-otp">6-digit verification code</label>
              <div className="juv-login__email">
                <input id="reset-otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={otp} onChange={event => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setNotice(''); }} aria-invalid={Boolean(notice && !/^[0-9]{6}$/.test(otp))} required disabled={busy || recoveryLocked} />
              </div>
              <p className="juv-login__notice" role="timer">{expiresSeconds > 0 ? `OTP expires in ${expiresSeconds}s` : 'Code expired. Request a new one.'}</p>
              <button className="juv-login__submit" type="submit" disabled={busy || recoveryLocked || expiresSeconds <= 0}>{busy ? 'Verifying...' : 'Verify OTP'}</button>
              {expiresSeconds === 0 && !recoveryLocked && !sendLimited && <button className="juv-recovery__resend-link" type="button" onClick={resendCode} disabled={busy || cooldownSeconds > 0}>Resend OTP</button>}
              {(recoveryLocked || sendLimited) && <p className="juv-login__notice" role="status">{limitMessage} {unlockSeconds > 0 && `Available in ${Math.floor(unlockSeconds / 3600)}h ${Math.floor((unlockSeconds % 3600) / 60)}m ${unlockSeconds % 60}s.`}</p>}
              <p className="juv-login__notice" role="status">{notice}</p>
            </form>
          </>}
          <p className="juv-login__register"><Link to="/login" onClick={cancel}>Cancel and return to Login</Link></p>
        </div>
      </section>
    </main>
  );
}