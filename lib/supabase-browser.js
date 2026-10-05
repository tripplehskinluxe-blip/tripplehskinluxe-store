import { createClient } from '@supabase/supabase-js';

// Browser client for the admin (uses the signed-in user's session; database rules decide what they may do).
let client;
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }));
}
