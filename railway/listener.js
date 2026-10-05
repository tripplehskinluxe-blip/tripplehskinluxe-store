// Standalone Paystack webhook listener for Railway. Plain Node, no Next.js.
//   POST /paystack/webhook  -> verifies the HMAC-SHA512 signature of the RAW body with PAYSTACK_SECRET_KEY, asks Paystack to
//                              confirm the payment, marks the order paid, sends the confirmation email.
//   GET  /health            -> 200 "ok" (for Railway's health check)
import http from 'node:http';
import { handlePaystackWebhook, MAX_WEBHOOK_BYTES } from '../lib/settlement.js';

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { chunks.length = 0; req.removeAllListeners('data'); req.pause(); reject(Object.assign(new Error('too large'), { code: 'TOO_LARGE' })); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(body); };

export function createListener({ db, secret, deps }) {
  const server = http.createServer(async (req, res) => {
    try {
      const path = (req.url || '').split('?')[0];
      if (req.method === 'GET' && path === '/health') return send(res, 200, 'ok');
      if (req.method === 'POST' && path === '/paystack/webhook') {
        const raw = await readBody(req, MAX_WEBHOOK_BYTES);
        const r = await handlePaystackWebhook({ raw, signature: String(req.headers['x-paystack-signature'] || ''), secret, db, deps });
        return send(res, r.status, r.body);
      }
      return send(res, 404, 'not found');
    } catch (e) {
      if (e?.code === 'TOO_LARGE') {          // answer, then close the connection so the rest of the body is never read
        res.once('finish', () => req.destroy());
        return send(res, 413, 'too large', { Connection: 'close' });
      }
      console.error('listener error', e?.message || e);
      return send(res, 500, 'error');
    }
  });
  server.headersTimeout = 10_000;     // slow-client protection
  server.requestTimeout = 15_000;
  return server;
}
