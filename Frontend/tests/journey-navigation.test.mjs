// Exercise this feature with controlled fixtures and assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePersonalDetails, validateAccountSecurity } from '../src/services/registrationValidation.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const event = () => ({ preventDefault() {}, currentTarget: { elements: { namedItem: () => ({ focus() {} }) } } });

test('three registration steps validate, prevent duplicate requests and navigate only after success', async () => {
  const source = readFileSync(new URL('../src/pages/auth/Register.jsx', import.meta.url), 'utf8');
  const body = source.split('  async function submit(event) {')[1].split('  function field(')[0].trim().replace(/}$/, '');
  const submit = new AsyncFunction('event', 'loading', 'created', 'submitting', 'values', 'step', 'validatePersonalDetails', 'validateAccountSecurity', 'setErrors', 'setStep', 'setValues', 'setLoading', 'setNotice', 'register', 'setCreated', 'navigate', body);
  let step = 0, calls = 0, resolveRequest;
  const notices = [], navigation = [], lock = { current: false };
  const values = { name: 'QA Parent', email: 'qa@example.com', phone: '0771234567', password: 'Valid-Pass1!', confirm: 'Valid-Pass1!', terms: true };
  const run = () => submit(event(), false, false, lock, values, step, validatePersonalDetails, validateAccountSecurity, () => {}, v => { step = v; }, () => {}, () => {}, v => notices.push(v), () => { calls++; return new Promise(resolve => { resolveRequest = resolve; }); }, () => {}, (...args) => navigation.push(args));
  await run(); assert.equal(step, 1);
  await run(); assert.equal(step, 2);
  const pending = run();
  await run();
  assert.equal(calls, 1); assert.equal(navigation.length, 0);
  resolveRequest({}); await pending;
  assert.deepEqual(navigation, [['/login', { replace: true }]]);
  assert.equal(lock.current, false);
});

test('login waits for confirmation, prevents duplicate submit and retains errors on failure', async () => {
  const source = readFileSync(new URL('../src/pages/auth/Login.jsx', import.meta.url), 'utf8');
  const body = source.match(/async function handleSubmit\(event\) \{([\s\S]*?)\n  \}/)[1];
  const submit = new AsyncFunction('event', 'loading', 'submitting', 'login', 'navigate', 'setNotice', 'setLoading', 'onLogin', 'FormData', 'getCurrentUser', 'logout', body);
  for (const success of [true, false]) {
    let calls = 0, resolveRequest, rejectRequest;
    const lock = { current: false }, navigation = [], notices = [];
    const run = () => submit(event(), false, lock, () => { calls++; return new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; }); }, (...args) => navigation.push(args), v => notices.push(v), () => {}, undefined, class { get() { return 'test'; } }, async () => ({ user_id: 1, role: 'parent', account_status: 'active' }), () => {});
    const pending = run(); await run();
    assert.equal(calls, 1); assert.equal(navigation.length, 0);
    if (success) resolveRequest({ user: { user_id: 1 } }); else rejectRequest(new Error('Incorrect email or password'));
    await pending;
    if (success) assert.deepEqual(navigation, [['/parent/home', { replace: true }]]);
    else { assert.equal(navigation.length, 0); assert.equal(notices.at(-1), 'Incorrect email or password'); }
    assert.equal(lock.current, false);
  }
});

test('login uses verified /me role and blocks unknown or inactive accounts', async () => {
  const source = readFileSync(new URL('../src/pages/auth/Login.jsx', import.meta.url), 'utf8');
  const body = source.match(/async function handleSubmit\(event\) \{([\s\S]*?)\n  \}/)[1];
  const submit = new AsyncFunction('event', 'loading', 'submitting', 'login', 'navigate', 'setNotice', 'setLoading', 'onLogin', 'FormData', 'getCurrentUser', 'logout', body);
  for (const [user, destination] of [
    [{ role: 'admin', account_status: 'active' }, '/admin/dashboard'],
    [{ role: 'parent', account_status: 'active' }, '/parent/home'],
    [{ role: 'admin', account_status: 'inactive' }, null],
    [{ role: 'unknown', account_status: 'active' }, null],
    [null, null],
  ]) {
    const navigation = [], notices = [], callbacks = [];
    let resolveVerification, signedOut = false;
    const pending = submit(event(), false, { current: false }, async () => ({ user: { role: 'untrusted-login-role' } }), (...args) => navigation.push(args), value => notices.push(value), () => {}, value => callbacks.push(value), class { get() { return 'test'; } }, () => new Promise(resolve => { resolveVerification = resolve; }), () => { signedOut = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(navigation.length, 0, 'must wait for /me verification');
    resolveVerification(user);
    await pending;
    if (destination) { assert.deepEqual(navigation, [[destination, { replace: true }]]); assert.deepEqual(callbacks, [user]); }
    else { assert.equal(navigation.length, 0); assert.equal(callbacks.length, 0); assert.equal(signedOut, true); }
  }
});

test('failed /me verification never redirects or invokes onLogin', async () => {
  const source = readFileSync(new URL('../src/pages/auth/Login.jsx', import.meta.url), 'utf8');
  const body = source.match(/async function handleSubmit\(event\) \{([\s\S]*?)\n  \}/)[1];
  const submit = new AsyncFunction('event', 'loading', 'submitting', 'login', 'navigate', 'setNotice', 'setLoading', 'onLogin', 'FormData', 'getCurrentUser', 'logout', body);
  const notices = [];
  await submit(event(), false, {current:false}, async () => ({}), () => assert.fail('Unexpected redirect'), value => notices.push(value), () => {}, () => assert.fail('Unexpected callback'), class { get() { return 'test'; } }, async () => { throw new Error('Verification unavailable'); }, () => {});
  assert.equal(notices.at(-1), 'Verification unavailable');
});
