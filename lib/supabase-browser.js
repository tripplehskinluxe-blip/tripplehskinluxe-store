import { createClient } from '@supabase/supabase-js';

// Browser client for the team area. The session lives in MEMORY ONLY: nothing is written to the browser's storage, so a page
// refresh, a closed tab or a closed browser ends the session and the person signs in again. (The database rules decide what they may do.)
let client;

// Remove any session an older version left behind in the browser's storage, so it can never be reused.
function purgeOldSessions() {
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      Object.keys(store).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => store.removeItem(k));
    }
  } catch { /* storage not available */ }
}

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (typeof window !== 'undefined') purgeOldSessions();
  return (client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } }));
}
