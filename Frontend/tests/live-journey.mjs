// Explicit opt-in: creates one QA user in the configured MySQL database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { validatePersonalDetails, validateAccountSecurity } from '../src/services/registrationValidation.js';

if (!process.argv.includes('--create-test-user')) throw new Error('Requires --create-test-user; this creates a real QA account.');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const auth = await server.ssrLoadModule('/src/services/authService.js');
  const email = `juvcare-qa-${randomUUID()}@example.com`;
  const password = `Qa!9${randomUUID()}`;
  const values = { name: 'JuvCare QA Parent', email, phone: '0771234567', password, confirm: password, terms: true };
  assert(validatePersonalDetails(values).valid);
  assert.deepEqual(validateAccountSecurity(values), {});
  const payload = { ...validatePersonalDetails(values).normalized, password };
  const started = performance.now();
  const registered = await auth.register(payload);
  console.log(`PASS real registration via frontend service (${Math.round(performance.now() - started)} ms); QA email: ${email}; user ID: ${registered.user.user_id}`);
  assert.equal(registered.user.role, 'parent');
  assert.equal(registered.user.account_status, 'active');
  await assert.rejects(auth.register(payload), /already registered/i);
  console.log('PASS duplicate registration rejected');
  await assert.rejects(auth.login({ email, password: `${password}-wrong` }), /Incorrect email or password/);
  console.log('PASS incorrect credentials rejected');
  // Execute the real Login submit handler with browser form/state adapters.
  const source = readFileSync('src/pages/auth/Login.jsx', 'utf8');
  const handler = source.match(/async function handleSubmit\(event\) \{([\s\S]*?)\n  \}/)[1];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const submit = new AsyncFunction('event', 'loading', 'submitting', 'login', 'navigate', 'setNotice', 'setLoading', 'onLogin', 'FormData', handler);
  const navigation = [];
  const notices = [];
  const Form = class { get(key) { return key === 'email' ? email : password; } };
  const loginStart = performance.now();
  await submit({ preventDefault() {}, currentTarget: {} }, false, { current: false }, auth.login, (...args) => navigation.push(args), value => notices.push(value), () => {}, undefined, Form);
  assert.deepEqual(navigation, [['/parent/home', { replace: true }]]);
  console.log(`PASS real login triggers dashboard navigation (${Math.round(performance.now() - loginStart)} ms; not browser timing)`);
  const me = await auth.getCurrentUser();
  assert.equal(me.user_id, registered.user.user_id);
  assert.equal(me.name, values.name);
  console.log('PASS real JWT accepted by /api/auth/me');
  const python = String.raw`import sys,json
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database.connection import get_engine
from app.models.user import User
from app.core.security import verify_password
data=json.load(sys.stdin)
with Session(get_engine()) as db:
    user=db.scalar(select(User).where(User.email==data['email']))
    assert user and user.role=='parent' and user.account_status=='active'
    assert user.password_hash.startswith('$argon2id$') and verify_password(data['password'],user.password_hash)
    assert user.phone=='+94771234567'
print('PASS MySQL record: parent, active, normalized phone, verified Argon2id password hash')`;
  const verified = spawnSync('../Backend/venv/Scripts/python.exe', ['-c', python], { cwd: '../Backend', input: JSON.stringify({ email, password }), encoding: 'utf8' });
  assert.equal(verified.status, 0, 'Database record verification failed (details suppressed to protect secrets)');
  console.log(verified.stdout.trim());
  auth.logout();
  assert.equal(await auth.getCurrentUser(), null);
  console.log('PASS absent in-memory session returns no user; account retained for QA audit');
} finally { await server.close(); }
