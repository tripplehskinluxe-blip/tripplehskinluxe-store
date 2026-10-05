// Pure product filtering/sorting (used for demo data; the database path does the same with SQL).
export function matchText(p, q) {
  const h = [p.name, p.brand, p.category, p.subcategory, p.sku, ...(p.tags || [])].join(' ').toLowerCase();
  return String(q).toLowerCase().split(/\s+/).filter(Boolean).every((t) => h.includes(t));
}

const SORTS = {
  featured: (a, b) => (b.isFeatured - a.isFeatured) || (b.isBestSeller - a.isBestSeller),
  newest: (a, b) => (b.isNew - a.isNew),
  best: (a, b) => b.reviewCount - a.reviewCount,
  plh: (a, b) => a.price - b.price,
  phl: (a, b) => b.price - a.price,
  rated: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
};

export function filterProducts(list, o = {}) {
  const r = list.filter((p) => {
    if (o.q && !matchText(p, o.q)) return false;
    if (o.cat && p.category !== o.cat) return false;
    if (o.brand && p.brand !== o.brand) return false;
    if (o.concern && !p.concerns.includes(o.concern)) return false;
    if (o.rating && p.rating < +o.rating) return false;
    if (o.avail === 'in' && p.stock <= 0) return false;
    if (o.avail === 'out' && p.stock > 0) return false;
    if (o.flag === 'new' && !p.isNew) return false;
    if (o.flag === 'best' && !p.isBestSeller) return false;
    if (o.flag === 'sale' && !p.discount) return false;
    if (o.price) {
      const [a, b] = String(o.price).split('-').map(Number);
      if (p.price < a || (b && p.price > b)) return false;
    }
    return true;
  });
  return r.sort(SORTS[o.sort] || SORTS.featured);
}
