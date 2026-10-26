import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';

const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const apiSource = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
const authSource = readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8').replace("'./api.js'", JSON.stringify(asModule(apiSource)));
const auth = await import(asModule(authSource));
const source = readFileSync(new URL('../src/routes/ProtectedRoute.jsx', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const { code } = await transformWithOxc(source, 'ProtectedRoute.jsx', { jsx: { runtime: 'classic' } });
const buildGuard = new Function('React', 'cloneElement', 'useEffect', 'useState', 'Navigate', 'getCurrentUser', code + '\nreturn ProtectedRoute;');
const child = React.createElement('admin-screen');
const active = role => ({ user_id: 1, name: 'Verified User', role, account_status: 'active' });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

async function renderGuard(requiredRole = 'admin') {
  let state, started = false;
  const guard = buildGuard(React, React.cloneElement, effect => { if (!started) { started = true; effect(); } }, () => [state, value => { state = value; }], 'redirect', auth.getCurrentUser);
  assert.equal(guard({ children: child, requiredRole }), null, 'protected UI is hidden while verification is pending');
  await new Promise(resolve => setImmediate(resolve));
  return guard({ children: child, requiredRole });
}

for (const [label, profile, destination] of [
  ['verified admin', active('admin'), null],
  ['verified parent', active('parent'), '/parent/home'],
  ['unknown role', active('superadmin'), '/login'],
  ['inactive admin', { ...active('admin'), account_status: 'inactive' }, '/login'],
]) {
  test(`admin route: ${label}`, async t => {
    auth.logout();
    const requests = [];
    const oldFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = oldFetch; auth.logout(); });
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return response(url.endsWith('/login') ? { access_token: 'test-token', token_type: 'bearer', user: active('admin') } : profile);
    };
    await auth.login({ email: 'admin@example.com', password: 'test' });
    const result = await renderGuard();
    assert.ok(requests.some(({url, options}) => url.endsWith('/me') && options.headers.Authorization === 'Bearer test-token'));
    if (destination) assert.equal(result.props.to, destination);
    else { assert.equal(result.type, 'admin-screen'); assert.deepEqual(result.props.user, profile); }
  });
}

test('localStorage admin role cannot grant access without an authenticated token', async t => {
  auth.logout();
  const oldStorage = globalThis.localStorage;
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.localStorage = oldStorage; globalThis.fetch = oldFetch; });
  globalThis.localStorage = { getItem: () => JSON.stringify(active('admin')) };
  globalThis.fetch = async () => { throw new Error('Unauthenticated checks must not fetch protected data'); };
  assert.equal((await renderGuard()).props.to, '/login');
});

test('expired JWT fails closed and clears the session', async t => {
  auth.logout();
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; auth.logout(); });
  globalThis.fetch = async url => url.endsWith('/login')
    ? response({ access_token: 'expired-token', token_type: 'bearer', user: active('admin') })
    : response({ detail: 'Invalid or expired access token' }, 401);
  await auth.login({ email: 'admin@example.com', password: 'test' });
  assert.equal((await renderGuard()).props.to, '/login');
  assert.equal(await auth.getCurrentUser(), null);
});

test('existing parent guard accepts parents and sends verified admins to their dashboard', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; auth.logout(); });
  for (const role of ['parent', 'admin']) {
    globalThis.fetch = async url => response(url.endsWith('/login')
      ? { access_token: 'test-token', token_type: 'bearer', user: active(role) } : active(role));
    await auth.login({ email: 'user@example.com', password: 'test' });
    const result = await renderGuard('parent');
    if (role === 'parent') assert.equal(result.type, 'admin-screen');
    else assert.equal(result.props.to, '/admin/dashboard');
  }
});
