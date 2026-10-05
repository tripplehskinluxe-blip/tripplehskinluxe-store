import 'server-only';
import { hasDb, supabasePublic } from '@/lib/supabase-public.js';
import { SEED_PRODUCTS, CATEGORIES, BRANDS } from '@/data/seed-products.js';
import { filterProducts } from '@/lib/filter.js';

export { hasDb };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fromDb = (r) => ({
  id: r.id, slug: r.slug, sku: r.sku, name: r.name, brand: r.brand,
  category: r.categories?.name || '', subcategory: r.subcategory || '',
  price: r.price_ngn, oldPrice: r.old_price_ngn || 0,
  discount: r.old_price_ngn ? Math.round((1 - r.price_ngn / r.old_price_ngn) * 100) : 0,
  stock: r.stock, images: r.images || [], shortDescription: r.short_description || '',
  description: r.description || '', ingredients: r.ingredients || '', howToUse: r.how_to_use || '',
  skinType: r.skin_type || '', concerns: r.concerns || [], tags: r.tags || [],
  isNew: r.is_new, isBestSeller: r.is_best_seller, isFeatured: r.is_featured,
  rating: Number(r.rating_avg || 0), reviewCount: r.review_count || 0,
});

const safe = (s) => String(s || '').replace(/[^\p{L}\p{N}\s.&'-]/gu, '').trim().slice(0, 60);

export async function getCategories() {
  if (!hasDb) return CATEGORIES;
  const { data } = await supabasePublic().from('categories').select('name,slug,description').order('sort').order('name');
  return data?.length ? data : CATEGORIES;
}

export async function getProducts(o = {}) {
  const pageSize = o.pageSize || 24, page = Math.max(1, +o.page || 1);
  if (!hasDb) {
    const r = filterProducts(SEED_PRODUCTS, o);
    return { items: r.slice((page - 1) * pageSize, page * pageSize), total: r.length, page, pageSize };
  }
  let qb = supabasePublic().from('products')
    .select(o.cat ? '*, categories!inner(name,slug)' : '*, categories(name,slug)', { count: 'exact' })
    .eq('is_active', true);
  if (o.cat) qb = qb.eq('categories.name', o.cat);
  if (o.brand) qb = qb.eq('brand', o.brand);
  if (o.concern) qb = qb.contains('concerns', [o.concern]);
  const q = safe(o.q);
  if (q) qb = qb.or(`name.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%`);
  if (o.flag === 'new') qb = qb.eq('is_new', true);
  if (o.flag === 'best') qb = qb.eq('is_best_seller', true);
  if (o.flag === 'sale') qb = qb.not('old_price_ngn', 'is', null);
  if (o.avail === 'in') qb = qb.gt('stock', 0);
  if (o.avail === 'out') qb = qb.lte('stock', 0);
  if (o.rating) qb = qb.gte('rating_avg', +o.rating);
  if (o.price) {
    const [a, b] = String(o.price).split('-').map(Number);
    if (a) qb = qb.gte('price_ngn', a);
    if (b) qb = qb.lte('price_ngn', b);
  }
  const order = {
    newest: () => qb.order('created_at', { ascending: false }),
    best: () => qb.order('review_count', { ascending: false }),
    plh: () => qb.order('price_ngn', { ascending: true }),
    phl: () => qb.order('price_ngn', { ascending: false }),
    rated: () => qb.order('rating_avg', { ascending: false }),
  }[o.sort];
  qb = order ? order() : qb.order('is_featured', { ascending: false }).order('is_best_seller', { ascending: false }).order('created_at', { ascending: false });
  const { data, count, error } = await qb.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) { console.error('getProducts', error.message); return { items: [], total: 0, page, pageSize }; }
  return { items: data.map(fromDb), total: count || 0, page, pageSize };
}

export async function getProductBySlug(slug) {
  if (!hasDb) return SEED_PRODUCTS.find((p) => p.slug === slug) || null;
  const { data } = await supabasePublic().from('products').select('*, categories(name,slug)').eq('slug', slug).eq('is_active', true).maybeSingle();
  return data ? fromDb(data) : null;
}

export async function getRelated(p, n = 4) {
  const { items } = await getProducts({ cat: p.category, pageSize: n + 1 });
  return items.filter((x) => x.id !== p.id).slice(0, n);
}

export async function getByIds(ids) {
  const clean = [...new Set(ids)].slice(0, 50);
  const seed = clean.filter((i) => String(i).startsWith('seed-'));
  const real = clean.filter((i) => UUID.test(i));
  let out = hasDb ? [] : SEED_PRODUCTS.filter((p) => seed.includes(p.id));
  if (hasDb && real.length) {
    const { data } = await supabasePublic().from('products').select('*, categories(name,slug)').in('id', real).eq('is_active', true);
    out = out.concat((data || []).map(fromDb));
  }
  return out;
}

export async function getHome() {
  if (!hasDb) {
    const best = SEED_PRODUCTS.filter((p) => p.isBestSeller).slice(0, 8);
    return { best, fresh: SEED_PRODUCTS.filter((p) => p.isNew).slice(0, 6), featured: SEED_PRODUCTS.filter((p) => p.isFeatured).slice(0, 3) };
  }
  const [b, n, f] = await Promise.all([
    getProducts({ flag: 'best', sort: 'best', pageSize: 8 }),
    getProducts({ flag: 'new', sort: 'newest', pageSize: 6 }),
    getProducts({ sort: 'featured', pageSize: 3 }),
  ]);
  return { best: b.items, fresh: n.items, featured: f.items };
}

export async function getBrands() {
  if (!hasDb) {
    const m = {}; SEED_PRODUCTS.forEach((p) => (m[p.brand] = (m[p.brand] || 0) + 1));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
  }
  const { data } = await supabasePublic().from('products').select('brand').eq('is_active', true).limit(5000);
  const m = {}; (data || []).forEach((p) => (m[p.brand] = (m[p.brand] || 0) + 1));
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
}

export async function allSlugs() {
  if (!hasDb) return SEED_PRODUCTS.map((p) => p.slug);
  const { data } = await supabasePublic().from('products').select('slug').eq('is_active', true).limit(5000);
  return (data || []).map((p) => p.slug);
}

export { BRANDS };
