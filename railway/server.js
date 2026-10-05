// Entry point on Railway:  npm run start:listener
import { createClient } from '@supabase/supabase-js';
import { createListener } from './listener.js';

const need = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PAYSTACK_SECRET_KEY'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error('Missing required environment variables:', missing.join(', ')); process.exit(1); }
if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) console.warn('Email is OFF (RESEND_API_KEY / EMAIL_FROM not set). Payments still work; confirmation emails are skipped.');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const server = createListener({ db, secret: process.env.PAYSTACK_SECRET_KEY });
const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Paystack listener ready on :${port}`));

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
