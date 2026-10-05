import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses row-level security. Import ONLY in server code (route handlers, server actions).
let client;
export function supabaseAdmin() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
