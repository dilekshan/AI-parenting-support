import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, getCurrentUser, logout, startGoogleLogin } from '../../services/authService';
import reference from '../../assets/images/login-reference.png';
import './Login.css';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const submitting = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || loading) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setLoading(true);
    setNotice('Signing in...');
    try {
      await login({ email: data.get('email'), password: data.get('password') });
      const user = await getCurrentUser();
      if (!user || user.account_status !== 'active' || !['admin', 'parent'].includes(user.role)) {
        logout();
        throw new Error('Unable to verify account access. Please sign in again.');
      }
      if (onLogin) onLogin(user);
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/parent/home', { replace: true });
    } catch (error) {
      setNotice(error.message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="juv-login">
      <section className="juv-login__card" aria-label="JuvCare sign in">
        <div className="juv-login__art">
          <img src={reference} alt="Welcome back! A mother and child share a loving moment, surrounded by leaves and flowers. Sign in to continue your child’s journey to a happier, kinder and brighter tomorrow." />
        </div>
        <div className="juv-login__panel">
          <nav className="juv-login__tabs" aria-label="Account"><Link to="/login" aria-current="page">Login</Link><Link to="/register">Register</Link></nav>
          <div className="juv-login__heading">
            <h1>Welcome Back</h1>
            <p>Sign in to your JuvCare account</p>
          </div>
          <form onSubmit={handleSubmit} aria-busy={loading}>
            <label className="juv-login__sr-only" htmlFor="login-email">Email</label>
            <div className="juv-login__email">
              <svg className="juv-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 5 9 7 9-7"/></svg>
              <input id="login-email" name="email" type="email" autoComplete="username" placeholder="Email address" required />
            </div>
            <label className="juv-login__sr-only" htmlFor="login-password">Password</label>
            <div className="juv-login__password">
              <svg className="juv-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/></svg>
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" required />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="m3 3 18 18"/>}</svg>
              </button>
            </div>
            <div className="juv-login__options">
              <label><input name="rememberMe" type="checkbox" /> Remember me</label>
              <a href="/forgot-password">Forgot password?</a>
            </div>
            <button className="juv-login__submit" type="submit" disabled={loading}>Login <span aria-hidden="true">&#8594;</span></button>
            <div className="juv-login__social-divider">or continue with</div>
            <div className="juv-login__social-buttons">
              <button className="juv-login__social-button" type="button" onClick={startGoogleLogin} disabled={loading}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.39 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.34-2.59Z" />
                  <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.34 2.59C7.18 7.72 9.39 5.96 12 5.96Z" />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
            <p className="juv-login__notice" role="status">{notice}</p>
          </form>
          <p className="juv-login__register">Don’t have an account? <Link to="/register">Register now <span aria-hidden="true">&#8594;</span></Link></p>
        </div>
      </section>
    </main>
  );
}
