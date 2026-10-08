// Validation for product CSV rows. Pure functions so they can be unit-tested.
const SKU_RE = /^[A-Za-z0-9._-]{2,40}$/;
const yes = (v) => /^(1|y|yes|true)$/i.test(String(v ?? '').trim());
const list = (v, max = 20) =>
  String(v ?? '').split(/[|;]/).map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, max);

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

const naira = (v) => Number(String(v ?? '').replace(/[₦,\s]/g, ''));

// Hosts product photos may come from. Must match the img-src list in next.config.js (the browser blocks everything else).
export function allowedImageHosts(supabaseUrl) {
  const hosts = ['res.cloudinary.com'];
  try { if (supabaseUrl) hosts.push(new URL(supabaseUrl).hostname); } catch { /* ignore a malformed url */ }
  return hosts;
}
const hostOk = (u, hosts) => {
  try { const h = new URL(u).hostname.toLowerCase(); return hosts.some((x) => h === x) || h.endsWith('.supabase.co'); } catch { return false; }
};

// opts.imageHosts (optional): when given, photo links from any other website are dropped and reported in `warnings`.
export function validateProductRow(r, opts = {}) {
  const name = String(r.name ?? '').trim();
  if (!name || name.length > 140) return { ok: false, error: 'name is required (max 140 characters)' };

  const sku = String(r.sku ?? '').trim();
  if (!SKU_RE.test(sku)) return { ok: false, error: 'sku is required (letters, numbers, . _ -)' };

  const price = naira(r.price);
  if (!Number.isInteger(price) || price < 0 || price > 10_000_000)
    return { ok: false, error: 'price must be a whole number of naira' };

  let oldPrice = null;
  if (String(r.old_price ?? '').trim() !== '') {
    oldPrice = naira(r.old_price);
    if (!Number.isInteger(oldPrice) || oldPrice <= price) return { ok: false, error: 'old_price must be a whole number above price' };
  }

  const stock = r.stock === undefined || String(r.stock).trim() === '' ? 0 : Number(r.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return { ok: false, error: 'stock must be a whole number 0 or more' };

  const warnings = [];
  const images = String(r.image_urls ?? '').split('|').map((s) => s.trim()).filter((u) => /^https:\/\//i.test(u)).filter((u) => {
    if (!opts.imageHosts || hostOk(u, opts.imageHosts)) return true;
    warnings.push(`photo link not allowed (host not permitted): ${u.slice(0, 80)}`);
    return false;
  }).slice(0, 8);

  return {
    ok: true,
    warnings,
    value: {
      sku,
      slug: slugify(name),
      name,
      brand: String(r.brand ?? '').trim().slice(0, 80) || 'Tripple H Skin Luxe',
      category: String(r.category ?? '').trim().slice(0, 60),
      subcategory: String(r.subcategory ?? '').trim().slice(0, 60) || null,
      price_ngn: price,
      old_price_ngn: oldPrice,
      stock,
      short_description: String(r.short_description ?? '').trim().slice(0, 200) || null,
      description: String(r.description ?? '').trim().slice(0, 4000) || null,
      ingredients: String(r.ingredients ?? '').trim().slice(0, 2000) || null,
      how_to_use: String(r.how_to_use ?? '').trim().slice(0, 2000) || null,
      tags: list(r.tags),
      concerns: list(r.concerns),
      images,
      is_featured: yes(r.featured),
      is_best_seller: yes(r.best_seller),
      is_new: yes(r.new),
      is_active: true,
    },
  };
}

/**
 * Splits imported rows into three groups so an import can never destroy what the CSV does not mention:
 *  - fresh: brand-new products, saved in full
 *  - withPhotos: existing products whose CSV row HAS photo links: photos are replaced
 *  - keepPhotos: existing products whose CSV row has NO photo links: their current photos are left exactly as they are
 * An import also never changes is_active of an existing product, so an archived product stays archived.
 * (Each group has the same set of fields, which an upsert needs.)
 */
export function splitImportBatches(payload, isExisting) {
  const fresh = [], withPhotos = [], keepPhotos = [];
  for (const row of payload) {
    if (!isExisting(row.sku)) { fresh.push(row); continue; }
    const { is_active, ...rest } = row;
    if (Array.isArray(rest.images) && rest.images.length) withPhotos.push(rest);
    else { const { images, ...noPhotos } = rest; keepPhotos.push(noPhotos); }
  }
  return { fresh, withPhotos, keepPhotos };
}
