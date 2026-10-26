import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import artwork from '../../assets/images/login-reference.png';
import logo from '../../assets/logo/985dc272-7657-42a7-aa1e-fd9ad04c085f.png';
import './Register.css';
import { validatePersonalDetails, validateAccountSecurity } from '../../services/registrationValidation.js';
import { register } from '../../services/authService';

const placeholders = {
  name: 'Enter your full name (e.g., user )',
  email: 'e.g., user@gmail.com',
  phone: 'e.g., 0771234567',
  password: 'Min. 8 characters (Aa1@)',
  confirm: 'Re-enter your password',
};

const titles = ['Personal Details', 'Account Security', 'Review & Create Account'];
export default function Register() {
  const navigate = useNavigate();
  const submitting = useRef(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '', confirm: '', terms: false });
  const [errors, setErrors] = useState({});
  const [visible, setVisible] = useState({ password: false, confirm: false });
  const [notice, setNotice] = useState('');
  const heading = useRef(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  function change(event) {
    const { name, value, checked, type } = event.target;
    setValues(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setNotice('');
  }
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || loading || created) return;
    const nextErrors = {};
    const personal = validatePersonalDetails(values);
    if (step === 0 || step === 2) Object.assign(nextErrors, personal.errors);
    if (step === 1 || step === 2) {
      Object.assign(nextErrors, validateAccountSecurity(values));
      if (!values.terms) nextErrors.terms = 'Accept the Terms and Privacy Policy to continue.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (step === 2) setStep(Object.keys(personal.errors).length ? 0 : 1);
      event.currentTarget.elements.namedItem(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    if (step < 2) {
      if (step === 0) setValues(previous => ({ ...previous, name: personal.normalized.name, email: personal.normalized.email }));
      setStep(step + 1);
    }
    else {
      submitting.current = true;
      setLoading(true);
      setNotice('Creating account...');
      try {
        await register({ ...personal.normalized, password: values.password });
        setCreated(true);
        setValues(previous => ({ ...previous, password: '', confirm: '' }));
        navigate('/login', { replace: true });
      } catch (error) {
        setNotice(error.message);
      } finally {
        submitting.current = false;
        setLoading(false);
      }
    }
  }
  function field(name, label, type = 'text', required = true, autoComplete) {
    return <div className="juv-register__field" key={name}>
      <label htmlFor={`register-${name}`}>{label}{!required && <span> (optional)</span>}</label>
      {name === 'password' || name === 'confirm' ? <div className="juv-register__password">
        <input id={`register-${name}`} name={name} type={type} placeholder={placeholders[name]} value={values[name]} onChange={change} required={required} autoComplete={autoComplete} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `error-${name}` : undefined} />
        <button className="juv-register__eye" type="button" aria-label={`${visible[name] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible[name]} onClick={() => setVisible(previous => ({ ...previous, [name]: !previous[name] }))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible[name] && <path d="m3 3 18 18" />}</svg>
        </button>
      </div> : <input id={`register-${name}`} name={name} type={type} placeholder={placeholders[name]} value={values[name]} onChange={change} required={required} autoComplete={autoComplete} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `error-${name}` : undefined} />}
      {errors[name] && <p className="juv-register__error" id={`error-${name}`} role="alert">{errors[name]}</p>}
    </div>;
  }
  return <main className="juv-register">
    <section className="juv-register__card" aria-label="JuvCare registration">
      <div className="juv-register__art"><img src={artwork} alt="Welcome Back! A mother and child surrounded by leaves and flowers. A brighter tomorrow." /></div>
      <div className="juv-register__panel">
        <nav className="juv-register__tabs" aria-label="Account"><Link to="/login">Login</Link><Link to="/register" aria-current="page">Register</Link></nav>
        <img className="juv-register__logo" src={logo} alt="JuvCare" />
        <p className="juv-register__eyebrow">STEP {step + 1} OF 3</p>
        <h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
        <ol className="juv-register__progress" aria-label="Registration progress">{titles.map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'is-active' : ''}><span>{index + 1}</span><span>{title}</span></li>)}</ol>
        <form onSubmit={submit} noValidate aria-busy={loading}>
          {step === 0 && <>{field('name', 'Full Name', 'text', true, 'name')}{field('email', 'Email Address', 'email', true, 'email')}{field('phone', 'Phone Number', 'tel', false, 'tel')}</>}
          {step === 1 && <>
            {field('password', 'Password', visible.password ? 'text' : 'password', true, 'new-password')}
            {field('confirm', 'Confirm Password', visible.confirm ? 'text' : 'password', true, 'new-password')}
            <label className="juv-register__terms"><input type="checkbox" name="terms" checked={values.terms} onChange={change} required aria-invalid={Boolean(errors.terms)} aria-describedby={errors.terms ? 'error-terms' : undefined} /><span>I accept the Terms and Privacy Policy.</span></label>
            {errors.terms && <p id="error-terms" className="juv-register__error" role="alert">{errors.terms}</p>}
          </>}
          {step === 2 && <dl className="juv-register__review"><dt>Full Name</dt><dd>{values.name.trim()}</dd><dt>Email Address</dt><dd>{values.email.trim()}</dd><dt>Phone Number</dt><dd>{values.phone.trim() || 'Not provided'}</dd></dl>}
          <div className="juv-register__actions">
            {step > 0 && <button type="button" className="juv-register__back" disabled={loading || created} onClick={() => { setStep(step - 1); setErrors({}); setNotice(''); }}>Back</button>}
            <button type="submit" className="juv-register__primary" disabled={loading || created}>{step === 2 ? 'Create Account' : 'Next'}</button>
          </div>
          <p className="juv-register__notice" role="status">{notice}</p>
        </form>
        <p className="juv-register__footer">Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </section>
  </main>;
}
