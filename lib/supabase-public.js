import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Read-only client using the public (anon) key. Row-level security limits it to public data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const hasDb = Boolean(url && key);
let client;
export const supabasePublic = () => (client ??= createClient(url, key, { auth: { persistSession: false } }));
