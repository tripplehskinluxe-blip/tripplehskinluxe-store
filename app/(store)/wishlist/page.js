'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ProductGrid from '@/components/ProductGrid';
import { useCart } from '@/components/CartProvider';

export default function Wishlist() {
  const { wish, ready, add, prune } = useCart();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const ids = wish.join(',');

  useEffect(() => {
    if (!ready) return;
    if (!ids) { setItems([]); setLoading(false); return; }
    fetch('/api/products?ids=' + encodeURIComponent(ids)).then((r) => { if (!r.ok) throw new Error('bad response'); return r.json(); }).then((d) => { const found = d.items || []; setItems(found); prune(ids.split(','), new Set(found.map((p) => p.id))); }).catch(() => {}).finally(() => setLoading(false));
  }, [ids, ready]);

  const shown = items.filter((p) => wish.includes(p.id));
  return (
    <>
      <div className="ph"><div className="container"><h1>Wishlist</h1><p>{shown.length} saved item{shown.length === 1 ? '' : 's'}</p></div></div>
      <div className="container" style={{ padding: '36px 20px 80px' }}>
        {loading ? <p className="mut center">Loading…</p> : shown.length ? (
          <>
            <ProductGrid items={shown} />
            <div className="center" style={{ marginTop: 34 }}><button className="btn ghost" onClick={() => shown.filter((p) => p.stock > 0).forEach((p) => add(p))}>Move all to bag</button></div>
          </>
        ) : (
          <div className="empty"><h3>Your wishlist is waiting.</h3><p>Save products you love and come back to them later.</p><Link className="btn" href="/shop">Start shopping</Link></div>
        )}
      </div>
    </>
  );
}
