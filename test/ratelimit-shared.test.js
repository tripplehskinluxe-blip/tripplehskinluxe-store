import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../lib/ratelimit.js';

mock.method(console, 'error', () => {});
const ENV = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const setEnv = (on) => { for (const k of ENV) { if (on) process.env[k] = k.endsWith('URL') ? 'https://fake-redis.test' : 'fake-token'; else delete process.env[k]; } };
const restore = () => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
// a fake shared store that counts like Redis does
function fakeStore(counts = {}) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const key = JSON.parse(init.body)[0][1];
    counts[key] = (counts[key] || 0) + 1;
    return { ok: true, json: async () => [{ result: counts[key] }, { result: 1 }] };
  };
  return calls;
}

test('shared limit: allows up to the max, then blocks; every instance shares the same counter', async () => {
  setEnv(true); fakeStore();
  const k = 'login:198.51.100.7:' + Math.random();
  const seen = []; for (let i = 0; i < 4; i++) seen.push(await rateLimit(k, 3, 60000));
  assert.deepEqual(seen, [true, true, true, false]);
  restore();
});

test('shared limit: the key is hashed, so the raw IP or email never reaches the shared store', async () => {
  setEnv(true); const calls = fakeStore();
  await rateLimit('login:jane@example.com', 5, 60000);
  const sent = JSON.stringify(calls[0].body);
  assert.doesNotMatch(sent, /jane@example\.com/); assert.match(sent, /rl:[0-9a-f]{64}/);
  restore();
});

test('shared limit: the window is set with NX, so the expiry is set once and not extended on every request', async () => {
  setEnv(true); const calls = fakeStore();
  await rateLimit('x', 5, 90000);
  assert.deepEqual(calls[0].body[1].slice(0, 3), ['PEXPIRE', calls[0].body[0][1], '90000']); assert.equal(calls[0].body[1][3], 'NX');
  assert.match(calls[0].url, /\/pipeline$/); assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-token');
  restore();
});

test('no shared store configured: the local limit still applies', async () => {
  setEnv(false);
  const k = 'local:' + Math.random();
  const seen = []; for (let i = 0; i < 4; i++) seen.push(await rateLimit(k, 3, 60000));
  assert.deepEqual(seen, [true, true, true, false]);
  restore();
});

test('shared store down (network error or bad status): falls back to the local limit, never opens the site', async () => {
  setEnv(true);
  global.fetch = async () => { throw new Error('ECONNRESET'); };
  const k = 'down:' + Math.random(); const a = []; for (let i = 0; i < 4; i++) a.push(await rateLimit(k, 3, 60000));
  assert.deepEqual(a, [true, true, true, false]);
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const k2 = 'down2:' + Math.random(); const b = []; for (let i = 0; i < 4; i++) b.push(await rateLimit(k2, 3, 60000));
  assert.deepEqual(b, [true, true, true, false]);
  restore();
});
