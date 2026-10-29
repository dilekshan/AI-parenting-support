// Exercise this feature with controlled fixtures and assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const apiSource = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
const authSource = readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8').replace("'./api.js'", JSON.stringify(asModule(apiSource)));
const authUrl = asModule(authSource);
const auth = await import(authUrl);
const serviceSource = readFileSync(new URL('../src/services/adminService.js', import.meta.url), 'utf8').replace("'./authService.js'", JSON.stringify(authUrl));
const service = await import(asModule(serviceSource));
const source = readFileSync(new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const { code } = await transformWithOxc(source, 'AdminDashboard.jsx', { jsx: { runtime: 'classic' } });
const createComponent = new Function('React', 'Link', 'logo', 'wordmark', 'useState', 'useEffect', 'getDashboardSummary', 'getRecentRegistrations', code + '\nreturn AdminDashboard;');
const totals = { total_children: null, total_parents: 7, active_users: 9, subscription_users: null };
const rows = [{ user_id: 11, name: 'Database User', role: 'parent', created_at: '2026-10-20T12:34:00' }];

// Provide lightweight state adapters for testing the component output.
function mount() {
  let index = 0, mounted = false;
  const states = [];
  const component = createComponent(React, ({ children }) => React.createElement('a', null, children), 'logo.png', 'wordmark.png', initial => {
    const slot = index++;
    if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
    return [states[slot], value => { states[slot] = value; }];
  }, effect => { if (!mounted) { mounted = true; effect(); } }, service.getDashboardSummary, service.getRecentRegistrations);
  return () => { index = 0; return renderToStaticMarkup(component({ user: { user_id: 1, name: 'Owner' } })); };
}

// Replace network responses so dashboard states can be tested without live accounts.
async function mockSession(t, summary = totals, registrations = rows, failSummary = false, failRegistrations = false) {
  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; auth.logout(); });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/login')) return new Response(JSON.stringify({ access_token: 'test-only-token', token_type: 'bearer', user: { user_id: 1 } }));
    const isSummary = url.endsWith('/summary');
    const fail = isSummary ? failSummary : failRegistrations;
    return new Response(JSON.stringify(fail ? { detail: 'Database temporarily unavailable' } : isSummary ? summary : registrations), { status: fail ? 503 : 200 });
  };
  await auth.login({ email: 'test@example.com', password: 'test-only' });
  return requests;
}

test('dashboard renders API values and real users, with null statistics as dashes', async t => {
  const requests = await mockSession(t);
  const render = mount();
  assert.match(render(), /Loading recent registrations/);
  await new Promise(resolve => setImmediate(resolve));
  const html = render();
  assert.match(html, /<strong>7<\/strong>/);
  assert.match(html, /<strong>9<\/strong>/);
  assert.equal((html.match(/aria-label="Not available">—/g) || []).length, 2);
  assert.match(html, /Database User/);
  assert.match(html, /2026-10-20T12:34:00/);
  assert.doesNotMatch(html, /Aarav|Kavin|Nithya|Saran|this week|Sample data|years/);
  for (const request of requests.filter(request => !request.url.endsWith('/login'))) assert.equal(request.options.headers.Authorization, 'Bearer test-only-token');
});

test('real zero counts and an empty registration list remain distinct from unavailable data', async t => {
  await mockSession(t, { ...totals, total_parents: 0, active_users: 0 }, []);
  const render = mount(); render(); await new Promise(resolve => setImmediate(resolve));
  const html = render();
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /No recent registrations/);
});

test('failed requests show errors and never fabricate counts or records', async t => {
  await mockSession(t, totals, rows, true, true);
  const render = mount(); render(); await new Promise(resolve => setImmediate(resolve));
  const html = render();
  assert.match(html, /Unable to load dashboard totals/);
  assert.match(html, /Unable to load recent registrations/);
  assert.doesNotMatch(html, /<strong>0<\/strong>|Database User|No recent registrations/);
});

test('one failed request does not hide the independently loaded section', async t => {
  await mockSession(t, totals, rows, true, false);
  const render = mount(); render(); await new Promise(resolve => setImmediate(resolve));
  const html = render();
  assert.match(html, /Unable to load dashboard totals/);
  assert.match(html, /Database User/);
});

test('malformed API responses are rejected instead of treated as zero or empty', async t => {
  await mockSession(t, {}, [{ name: 'Invalid' }]);
  await assert.rejects(service.getDashboardSummary(), /Invalid dashboard summary/);
  await assert.rejects(service.getRecentRegistrations(), /Invalid recent registrations/);
});

test('admin data requests require the existing authenticated session', async () => {
  auth.logout();
  await assert.rejects(service.getDashboardSummary(), /Please sign in/);
  await assert.rejects(service.getRecentRegistrations(), /Please sign in/);
});
