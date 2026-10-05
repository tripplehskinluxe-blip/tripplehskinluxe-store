import 'server-only';
import { unstable_cache } from 'next/cache';
import { hasDb, supabasePublic } from '@/lib/supabase-public.js';
import { loadSettings, buildSettings } from '@/lib/settings-core.js';

// The shop's editable settings (contact details, fees, spa menu, FAQ ...), read from the database.
// Cached for up to 60 seconds, and the cache is cleared the moment an admin saves (see /api/admin/settings).
// With no database connected, or if it cannot be reached, the first-run defaults from content/defaults.js are used.
const cached = unstable_cache(async () => loadSettings(supabasePublic()), ['site-settings-v1'], { tags: ['settings'], revalidate: 60 });

export async function getSettings() {
  if (!hasDb) return buildSettings([]);
  try { return await cached(); }
  catch (e) { console.error('settings: using defaults,', e?.message || e); return buildSettings([]); }
}
