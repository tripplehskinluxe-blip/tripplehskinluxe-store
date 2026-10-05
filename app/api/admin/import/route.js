import 'server-only';
import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { requireStaff } from '@/lib/auth.js';
import { rateLimit } from '@/lib/ratelimit.js';
import { validateProductRow, slugify, allowedImageHosts } from '@/lib/rows.js';

export const runtime = 'nodejs';
const MAX_ROWS = 2000;
const MAX_BYTES = 5_000_000;
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const fail = (e) => { console.error('import failed', e?.message || e); return NextResponse.json({ error: 'Import failed' }, { status: 500 }); };

// POST text/csv body. Add ?dry=1 for a preview that writes nothing. Admin only.
export async function POST(req) {
  const auth = await requireStaff(req, { adminOnly: true });
  if (auth.error) return auth.error;
  if (!rateLimit(`import:${auth.user.id}`, 6, 60_000)) return NextResponse.json({ error: 'Too many imports. Wait a minute.' }, { status: 429 });

  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const text = await req.text();
  if (!text || text.length > MAX_BYTES) return NextResponse.json({ error: 'CSV is missing or larger than 5MB' }, { status: 413 });

  const parsed = Papa.parse(text.replace(/^\ufeff/, ''), {
    header: true, skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  });
  if (parsed.data.length > MAX_ROWS) return NextResponse.json({ error: `Maximum ${MAX_ROWS} rows per import` }, { status: 413 });

  const errors = [];
  const warnings = [];
  const imageHosts = allowedImageHosts(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const bySku = new Map();
  parsed.data.forEach((raw, i) => {
    const v = validateProductRow(raw, { imageHosts });
    if (!v.ok) { errors.push({ row: i + 2, error: v.error }); return; }
    v.warnings.forEach((w) => warnings.push({ row: i + 2, error: w }));
    if (bySku.has(v.value.sku)) errors.push({ row: i + 2, error: `duplicate sku ${v.value.sku}; later row wins` });
    bySku.set(v.value.sku, v.value);
  });
  const rows = [...bySku.values()];
  const db = supabaseAdmin();

  const existing = new Map();
  for (const part of chunk(rows.map((r) => r.sku), 150)) {
    const { data, error } = await db.from('products').select('id,sku,stock,slug').in('sku', part);
    if (error) return fail(error);
    data.forEach((p) => existing.set(p.sku, p));
  }
  const created = rows.filter((r) => !existing.has(r.sku)).length;
  const updated = rows.length - created;
  if (dry) return NextResponse.json({ dry: true, created, updated, skipped: errors.length, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });

  // categories (create any that are new)
  const names = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const catId = new Map();
  if (names.length) {
    const { data } = await db.from('categories').select('id,name').in('name', names);
    (data || []).forEach((c) => catId.set(c.name, c.id));
    const missing = names.filter((n) => !catId.has(n));
    if (missing.length) {
      const { data: ins, error } = await db.from('categories').insert(missing.map((n) => ({ name: n, slug: slugify(n) }))).select('id,name');
      if (error) return fail(error);
      ins.forEach((c) => catId.set(c.name, c.id));
    }
  }

  // slugs: keep existing URLs stable; avoid collisions for new products
  const taken = new Map();
  for (const part of chunk(rows.map((r) => r.slug), 150)) {
    const { data } = await db.from('products').select('sku,slug').in('slug', part);
    (data || []).forEach((p) => taken.set(p.slug, p.sku));
  }
  const usedInFile = new Set();
  const payload = rows.map((r) => {
    let slug = existing.get(r.sku)?.slug || r.slug;
    const owner = taken.get(slug);
    if (!existing.has(r.sku) && ((owner && owner !== r.sku) || usedInFile.has(slug))) slug = `${slug}-${slugify(r.sku)}`;
    usedInFile.add(slug);
    const { category, ...rest } = r;
    return { ...rest, slug, category_id: category ? catId.get(category) || null : null };
  });

  const touched = [];
  for (const part of chunk(payload, 200)) {
    const { data, error } = await db.from('products').upsert(part, { onConflict: 'sku' }).select('id,sku,stock');
    if (error) return fail(error);
    touched.push(...data);
  }

  const moves = touched
    .map((p) => ({ product_id: p.id, delta: p.stock - (existing.get(p.sku)?.stock || 0), reason: 'import', created_by: auth.user.id }))
    .filter((m) => m.delta !== 0);
  for (const part of chunk(moves, 500)) {
    const { error } = await db.from('stock_movements').insert(part);
    if (error) console.error('stock movement log failed', error.message);
  }
  await db.from('audit_log').insert({ actor: auth.user.id, action: 'product_import', entity: 'products', meta: { created, updated, skipped: errors.length } });

  return NextResponse.json({ created, updated, skipped: errors.length, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
}
