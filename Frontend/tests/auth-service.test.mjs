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
