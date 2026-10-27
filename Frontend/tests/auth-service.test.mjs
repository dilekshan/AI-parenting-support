import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const apiSource = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
const apiUrl = asModule(apiSource);
const {apiRequest} = await import(apiUrl);
const authSource = readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8').replace("'./api.js'", JSON.stringify(apiUrl));
const auth = await import(asModule(authSource));
const reply = (body, status = 200) => new Response(JSON.stringify(body), {status});

test('rejects HTML success instead of falsely registering', async () => {
  globalThis.fetch = async () => new Response('<html>wrong server</html>');
  await assert.rejects(auth.register({}), /Invalid server response/);
});
test('rejects malformed login and registration JSON', async () => {
  globalThis.fetch = async () => reply({});
  await assert.rejects(auth.register({}), /Invalid registration response/);
  await assert.rejects(auth.login({email:'p@example.com', password:'secret'}), /Invalid login response/);
});
test('reports duplicate, validation, invalid credentials and network errors', async () => {
  for (const [status, detail] of [[409,'Email is already registered'],[401,'Incorrect email or password'],[422,[{msg:'Invalid email'}]]]) {
    globalThis.fetch = async () => reply({detail},status);
    await assert.rejects(apiRequest('/test'), new RegExp(Array.isArray(detail) ? detail[0].msg : detail));
  }
  globalThis.fetch = async () => { throw new TypeError('network'); };
  await assert.rejects(apiRequest('/test'), /Unable to reach the server/);
});
test('sends correct login and registration payloads and bearer token', async () => {
  const requests=[];
  globalThis.fetch = async (url,options) => {
    requests.push({url,options});
    if(url.endsWith('/login')) return reply({access_token:'test-token',token_type:'bearer',user:{user_id:1}});
    if(url.endsWith('/register')) return reply({message:'Account created',user:{user_id:1}},201);
    return reply({user_id:1});
  };
  await auth.register({name:'Parent',email:'p@example.com',password:'secret',phone:null});
  await auth.login({email:' p@example.com ',password:'secret'});
  await auth.getCurrentUser();
  assert.equal(requests[0].url,'http://localhost:8000/api/auth/register');
  assert.deepEqual(JSON.parse(requests[1].options.body),{email:'p@example.com',password:'secret'});
  assert.equal(requests[2].options.headers.Authorization,'Bearer test-token');
  globalThis.fetch = async () => reply({detail:'Incorrect email or password'},401);
  await assert.rejects(auth.login({email:'p@example.com',password:'wrong'}));
  assert.equal(await auth.getCurrentUser(),null);
});

test('timeout aborts a stalled request and also bounds a stalled response body', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  for (const stalledBody of [false, true]) {
    let signal;
    globalThis.fetch = async (_url, options) => {
      signal = options.signal;
      if (stalledBody) return { ok: true, json: () => new Promise(() => {}) };
      return new Promise(() => {});
    };
    await assert.rejects(apiRequest('/api/auth/login', { timeoutMs: 20 }), /timed out/);
    assert.equal(signal.aborted, true);
  }
});

test('login handler resets loading and verifies roles before navigating', async () => {
  const source = readFileSync(new URL('../src/pages/auth/Login.jsx', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('  async function handleSubmit'), source.indexOf('\n  return ('));
  for (const role of ['admin', 'parent', 'unknown', 'failure']) {
    let loading = false, notice = '', destination;
    const submitting = { current: false };
    const make = new Function('submitting', 'loading', 'FormData', 'setLoading', 'setNotice', 'login', 'getCurrentUser', 'logout', 'onLogin', 'navigate', handler + '; return handleSubmit;');
    const run = make(submitting, false, class { get() { return 'fixture'; } }, value => { loading = value; }, value => { notice = value; }, async () => {
      if (role === 'failure') throw new Error('Unable to reach the server. Please try again.');
    }, async () => ({ role, account_status: 'active' }), () => {}, null, path => { destination = path; });
    await run({ preventDefault() {}, currentTarget: {} });
    assert.equal(loading, false);
    assert.equal(submitting.current, false);
    if (role === 'admin' || role === 'parent') assert.equal(destination, role === 'admin' ? '/admin/dashboard' : '/parent/home');
    else { assert.equal(destination, undefined); assert.notEqual(notice, 'Signing in...'); }
  }
});

test('profile upload sends image bytes with JWT and preserves binary content type', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; auth.logout(); });
  globalThis.fetch = async () => reply({access_token:'fixture-token',token_type:'bearer',user:{user_id:1}});
  await auth.login({email:'fixture@example.com',password:'fixture'});
  const file = new Blob(['fixture-image-bytes']);
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/api/auth/me/profile-photo'));
    assert.equal(options.body, file);
    assert.equal(options.headers['Content-Type'], 'application/octet-stream');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    return reply({profile_photo_url:'/api/profile-photos/fixture.webp'});
  };
  assert.equal((await auth.uploadProfilePhoto(file)).profile_photo_url, '/api/profile-photos/fixture.webp');
});
