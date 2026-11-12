// What a shopper types in the search box -> search words that forgive plurals and UK/US spelling.
// Pure (no database, no Next.js) so it is testable and shared by the shop and the demo catalogue.
const STOP = new Set(['a', 'an', 'and', 'or', 'the', 'for', 'with', 'of', 'in', 'to', 'my', 'on', 'any']);
const MAX_WORDS = 5;
const MAX_VARIANTS = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = ['name', 'brand', 'sku', 'subcategory'];

/** Letters and digits only (so a typed word can never carry filter syntax), no filler words, at most 5. */
export function searchWords(q) {
  const all = [...new Set(String(q ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.slice(0, 30)))];
  const kept = all.filter((w) => !STOP.has(w));
  return (kept.length ? kept : all).slice(0, MAX_WORDS);
}

function plurals(w) {
  const out = [];
  if (w.length > 3 && w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (w.length > 4 && w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1));
  return out;
}

function spellings(w) {
  const out = [];
  if (/is(e|ed|er|ers|ing)$/.test(w)) out.push(w.replace(/is(e|ed|er|ers|ing)$/, 'iz$1'));          // moisturiser -> moisturizer
  if (/iz(e|ed|er|ers|ing)$/.test(w)) out.push(w.replace(/iz(e|ed|er|ers|ing)$/, 'is$1'));          // moisturizer -> moisturiser
  const m = /^(colo|flavo|favo|hono|neighbo)(u?)r(s?)$/.exec(w);                                      // colour <-> color
  if (m) out.push(`${m[1]}${m[2] ? '' : 'u'}r${m[3]}`);
  return out;
}

/** The word itself first, then forgiving alternatives (at most 4 in all). */
export function wordVariants(w) {
  const out = [w];
  const add = (x) => { if (x && x.length >= 3 && !out.includes(x)) out.push(x); };
  plurals(w).forEach(add);
  [...out].forEach((x) => spellings(x).forEach(add));
  return out.slice(0, MAX_VARIANTS);
}

const quote = (s) => `"${String(s).replace(/["\\]/g, '')}"`;
const low = (s) => String(s || '').toLowerCase();

/**
 * PostgREST "or" expressions for the shop query.
 *  mode 'all': one expression per word, applied one after another, so EVERY word must match somewhere.
 *  mode 'any': a single expression, so ANY word may match (used when 'all' finds nothing).
 * A word matches a product's name, brand, code or subcategory, or the NAME of its category, or the name / group heading
 * of its subcategory (so "face" finds every product in the Face group).
 */
export function buildSearchFilters({ q, categories = [], subcategories = [], mode = 'all' }) {
  const exprs = searchWords(q).map((w) => {
    const vs = wordVariants(w);
    const parts = [];
    for (const v of vs) for (const col of COLUMNS) parts.push(`${col}.ilike.%${v}%`);
    const catIds = categories.filter((c) => UUID.test(String(c.id)) && vs.some((v) => low(c.name).includes(v))).map((c) => c.id);
    if (catIds.length) parts.push(`category_id.in.(${[...new Set(catIds)].join(',')})`);
    const subNames = [...new Set(subcategories.filter((s) => vs.some((v) => low(s.name).includes(v) || low(s.group_name).includes(v))).map((s) => s.name))];
    if (subNames.length) parts.push(`subcategory.in.(${subNames.map(quote).join(',')})`);
    return parts.join(',');
  });
  if (!exprs.length) return [];
  return mode === 'any' ? [exprs.join(',')] : exprs;
}
