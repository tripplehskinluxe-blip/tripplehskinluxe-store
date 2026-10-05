import 'server-only';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only real, published reviews are ever shown. The demo catalogue (no database) has none.
export async function getReviews(product) {
  if (!url || !key || String(product.id).startsWith('seed-')) return [];
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await db.from('reviews').select('id,name,rating,body,created_at').eq('product_id', product.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20);
  return (data || []).map((r) => ({ id: r.id, name: r.name, rating: r.rating, text: r.body, date: r.created_at }));
}
