import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const apiSource = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  .replace('import.meta.env.VITE_API_URL', 'undefined');
const apiUrl = asModule(apiSource);
const serviceSource = readFileSync(new URL('../src/services/passwordRecoveryService.js', import.meta.url), 'utf8')
  .replace("'./api.js'", JSON.stringify(apiUrl));
const service = await import(asModule(serviceSource));
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('request sends the Login email and optional challenge using backend field names', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return reply({ message: 'If an eligible account matches, a code will be sent.', challenge_id: 'challenge-id' });
  };

  await service.requestPasswordReset('parent@example.com');
  await service.requestPasswordReset('parent@example.com', 'previous-challenge');

  assert.equal(requests[0].url, 'http://localhost:8000/api/auth/password-reset/request');
  assert.deepEqual(JSON.parse(requests[0].options.body), { email: 'parent@example.com' });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    email: 'parent@example.com',
    challenge_id: 'previous-challenge',
  });
});

test('verification sends exact backend names and never includes email or auth token', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return reply({ message: 'Password updated. You can now sign in.' });
  };

  await service.verifyPasswordReset({
    challengeId: 'challenge-id',
    otp: '012345',
    newPassword: 'New-password2!',
    confirmNewPassword: 'New-password2!',
  });

  assert.equal(request.url, 'http://localhost:8000/api/auth/password-reset/verify');
  assert.deepEqual(JSON.parse(request.options.body), {
    challenge_id: 'challenge-id',
    otp: '012345',
    new_password: 'New-password2!',
    confirm_new_password: 'New-password2!',
  });
  assert.equal(request.options.headers.Authorization, undefined);
});

test('recovery page keeps secrets out of browser storage and restarts at password stage', () => {
  const page = readFileSync(new URL('../src/pages/auth/ForgotPassword.jsx', import.meta.url), 'utf8');
  assert.match(page, /useState\(\{ newPassword: '', confirmNewPassword: '' \}\)/);
  assert.match(page, /useState\('password'\)/);
  assert.match(page, /New Password/);
  assert.match(page, /Confirm New Password/);
  assert.match(page, /Verify OTP/);
  assert.match(page, /Resend OTP/);
  assert.match(page, /maskEmail\(email\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\.(log|debug|info)/);
  assert.doesNotMatch(page, /type="email"/);
});