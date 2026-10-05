import 'server-only';
import { hasDb, supabasePublic } from '@/lib/supabase-public.js';
import { LEGAL_DEFAULTS, LEGAL_SLUGS } from '@/content/legal.js';

// The admin's saved version if there is one, otherwise the built-in draft.
export async function getLegalPage(slug) {
  if (!LEGAL_SLUGS.includes(slug)) return null;
  const fallback = { ...LEGAL_DEFAULTS[slug], slug, updatedAt: null, custom: false };
  if (!hasDb) return fallback;
  const { data, error } = await supabasePublic().from('pages').select('title,body,updated_at').eq('slug', slug).maybeSingle();
  if (error || !data) return fallback;
  return { slug, title: data.title, body: data.body, updatedAt: data.updated_at, custom: true };
}
