// Shared CSV helpers (browser + node).
export const PRODUCT_COLUMNS = ['sku','name','brand','category','subcategory','price','old_price','stock','short_description','description','ingredients','how_to_use','tags','concerns','image_urls','featured','best_seller','new'];
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
export const toCSV = (header, rows) => [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');

export function downloadCSV(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// One product -> one CSV row, in PRODUCT_COLUMNS order (the same format the importer reads).
export const productToRow = (p) => [
  p.sku, p.name, p.brand, p.categories?.name || '', p.subcategory || '', p.price_ngn, p.old_price_ngn || '', p.stock,
  p.short_description || '', p.description || '', p.ingredients || '', p.how_to_use || '',
  (p.tags || []).join('|'), (p.concerns || []).join('|'), (p.images || []).filter((u) => /^https:\/\//.test(u)).join('|'),
  p.is_featured ? 1 : 0, p.is_best_seller ? 1 : 0, p.is_new ? 1 : 0,
];
