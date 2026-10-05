import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createListener } from '../railway/listener.js';

const SECRET = 'sk_test_listener';
const REF = 'ths_12345678-1234-1234-1234-123456789abc';
const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex');

function boot(verify) {
  const calls = [];
  const db = { rpc: async (n, a) => { calls.push(n); return { data: n === 'mark_order_paid' ? 'paid' : null, error: null }; } };
  const server = createListener({ db, secret: SECRET, deps: { verify, mail: { emailConfigured: () => false } } });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}
const post = (url, body, sig) => fetch(url + '/paystack/webhook', { method: 'POST', body, headers: sig ? { 'x-paystack-signature': sig } : {} });
const good = async () => ({ status: 'success', currency: 'NGN', amount: 1200000 });

test('listener: /health, unknown paths, wrong method', async () => {
  const { server, url } = await boot(good);
  try {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await fetch(url + '/nope')).status, 404);
    assert.equal((await fetch(url + '/paystack/webhook')).status, 404);   // GET is not allowed
  } finally { server.close(); }
});

test('listener: HMAC is checked over the exact raw bytes', async () => {
  const { server, url, calls } = await boot(good);
  try {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: REF } });
    assert.equal((await post(url, body, undefined)).status, 401);                 // no signature
    assert.equal((await post(url, body, 'abc123')).status, 401);                  // wrong signature
    assert.equal((await post(url, body + ' ', sign(body))).status, 401);         // body changed by one byte
    assert.equal(calls.length, 0);
    assert.equal((await post(url, body, sign(body))).status, 200);                // genuine
    assert.deepEqual(calls, ['mark_order_paid']);
    const spaced = '{ "event":"charge.success",\n "data":{"reference":"' + REF + '"} }';   // formatting differs: still signed over exact bytes
    assert.equal((await post(url, spaced, sign(spaced))).status, 200);
  } finally { server.close(); }
});

test('listener: Paystack outage gives 500 (so Paystack retries); huge body gives 413', async () => {
  const { server, url } = await boot(async () => null);
  try {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: REF } });
    assert.equal((await post(url, body, sign(body))).status, 500);
    assert.equal((await post(url, 'x'.repeat(1_200_000), 'abc')).status, 413);
  } finally { server.close(); }
});
