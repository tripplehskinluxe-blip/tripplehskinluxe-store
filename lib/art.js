// Illustrated product placeholders (used when a product has no photo yet). Pure string output.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TINT = {
  Skincare: ['#f1e9fb', '#ddcbf3'], 'Body Care': ['#f4eefa', '#e5d6f2'], 'Hair Care': ['#efeefb', '#d7d3f3'],
  Fragrance: ['#ece6f8', '#d3c6ee'], 'Spa & Wellness': ['#f0eefb', '#dcd6f3'],
};
const CAT_SHAPE = { Skincare: 'd', 'Body Care': 'j', 'Hair Care': 'p', Fragrance: 'f', 'Spa & Wellness': 's' };

export function shapeFor(p) {
  if (p.shape) return p.shape;
  const s = `${p.subcategory} ${p.name}`.toLowerCase();
  if (/serum|oil/.test(s)) return 'd';
  if (/cleanser|sun|spf/.test(s)) return 't';
  if (/lotion|wash|gel|mist|shampoo|conditioner/.test(s)) return 'p';
  if (/perfume|parfum/.test(s)) return 'f';
  if (/cream|butter|scrub|candle|soak/.test(s)) return 'j';
  return CAT_SHAPE[p.category] || 'j';
}

export function art(p, v = 0) {
  const h = [...String(p.slug || p.id || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const t = TINT[p.category] || TINT.Skincare, bg = t[v % 2];
  const cap = ['#4b1f75', '#2b1445', '#6b3da0', '#1e1429'][(h + v) % 4], lab = '#f3ecfa';
  const tx = (y, s = 5.5) => `<text x="100" y="${y}" text-anchor="middle" font-size="${s}" fill="#4b1f75" font-family="sans-serif" letter-spacing=".9" font-weight="600">${esc((p.brand || '').toUpperCase().slice(0, 13))}</text>`;
  const nm = (y) => `<text x="100" y="${y}" text-anchor="middle" font-size="4.8" fill="#6f6581" font-family="sans-serif">${esc((p.name || '').split(' ').slice(0, 2).join(' '))}</text>`;
  const S = {
    d: `<rect x="72" y="84" width="56" height="86" rx="10" fill="#fff"/><rect x="92" y="68" width="16" height="18" fill="${cap}"/><rect x="94" y="36" width="12" height="34" rx="6" fill="${cap}"/><rect x="79" y="108" width="42" height="44" rx="3" fill="${lab}"/>${tx(126)}${nm(136)}`,
    j: `<rect x="52" y="104" width="96" height="66" rx="14" fill="#fff"/><rect x="48" y="80" width="104" height="28" rx="9" fill="${cap}"/><rect x="62" y="122" width="76" height="34" rx="3" fill="${lab}"/>${tx(138)}${nm(148)}`,
    t: `<path d="M70 56h60l-4 100H74z" fill="#fff"/><rect x="68" y="44" width="64" height="14" rx="3" fill="${cap}"/><rect x="76" y="156" width="48" height="16" rx="4" fill="${cap}"/><rect x="78" y="86" width="44" height="46" rx="3" fill="${lab}"/>${tx(106)}${nm(116)}`,
    p: `<rect x="62" y="86" width="76" height="86" rx="14" fill="#fff"/><rect x="93" y="70" width="14" height="18" fill="${cap}"/><rect x="80" y="54" width="42" height="16" rx="5" fill="${cap}"/><rect x="118" y="58" width="22" height="7" rx="3" fill="${cap}"/><rect x="72" y="112" width="56" height="42" rx="3" fill="${lab}"/>${tx(130)}${nm(140)}`,
    f: `<rect x="56" y="88" width="88" height="84" rx="16" fill="#fff" opacity=".95"/><rect x="86" y="54" width="28" height="36" rx="5" fill="${cap}"/><rect x="92" y="86" width="16" height="8" fill="#d9c7ee"/><rect x="68" y="110" width="64" height="40" rx="3" fill="${lab}"/>${tx(128)}${nm(138)}`,
    s: `<rect x="56" y="76" width="88" height="96" rx="14" fill="#fff"/><rect x="52" y="62" width="96" height="22" rx="8" fill="${cap}"/><rect x="66" y="102" width="68" height="52" rx="3" fill="${lab}"/>${tx(124)}${nm(134)}`,
  };
  const deco = ['', '<circle cx="152" cy="48" r="46" fill="#fff" opacity=".55"/>', '<circle cx="44" cy="152" r="60" fill="#fff" opacity=".5"/>', '<rect x="0" y="146" width="200" height="54" fill="#fff" opacity=".45"/><circle cx="160" cy="40" r="16" fill="#fff" opacity=".6"/>'][v % 4];
  return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(p.name || '')}"><rect width="200" height="200" fill="${bg}"/>${deco}<ellipse cx="100" cy="174" rx="46" ry="5" fill="#3a1560" opacity=".14"/>${S[shapeFor(p)] || S.j}</svg>`;
}
