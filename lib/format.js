export const naira = (n) => '₦' + Math.round(n || 0).toLocaleString('en-NG');
// Safe lookup in a label map (never returns inherited keys like "constructor")
export const labelOf = (map, k) => (Object.hasOwn(map, k) ? map[k] : k);
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// "Tripple H Skin Luxe" -> ["TRIPPLE H", "SKIN LUXE"] for the two-line logo
export function logoParts(name) {
  const w = String(name).toUpperCase().split(' ');
  const n = w.length > 2 ? 2 : 1;
  return [w.slice(0, n).join(' '), w.slice(n).join(' ')];
}

export function buildQuery(params, overrides = {}) {
  const p = new URLSearchParams();
  Object.entries({ ...params, ...overrides }).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
}
