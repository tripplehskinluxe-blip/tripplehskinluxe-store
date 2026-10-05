'use client';
import { useEffect, useState } from 'react';
import { useCart } from './CartProvider';
import { calcTotals } from '@/lib/pricing.js';

// Loads live product data (price, stock) for what is in the bag, and remembers the promo/zone choices.
export function useCartLines() {
  const { cart, ready, prune } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const ids = cart.map((c) => c.id).join(',');

  useEffect(() => {
    if (!ready) return;
    if (!ids) { setProducts([]); setLoading(false); return; }
    setLoading(true);
    fetch('/api/products?ids=' + encodeURIComponent(ids)).then((r) => { if (!r.ok) throw new Error('bad response'); return r.json(); }).then((d) => { const items = d.items || []; setProducts(items); prune(ids.split(','), new Set(items.map((p) => p.id))); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [ids, ready]);

  const lines = cart.map((c) => ({ p: products.find((x) => x.id === c.id), qty: c.qty })).filter((l) => l.p);
  return { lines, loading: loading || !ready };
}

export function totalsFor(lines, promo, zone, delivery) {
  return calcTotals({
    items: lines.map((l) => ({ price: l.p.price, qty: l.qty })),
    discount: promo,
    state: zone === 'lagos' ? 'Lagos' : 'Other',
    settings: delivery,
  });
}
