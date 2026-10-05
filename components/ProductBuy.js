'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { useCart } from './CartProvider';
import { useSettings } from './SettingsProvider';

export default function ProductBuy({ product }) {
  const { waLink, store } = useSettings();
  const { add, wish, toggleWish } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const oos = product.stock <= 0;
  const inWish = wish.includes(product.id);
  const step = (d) => setQty(Math.min(Math.max(1, qty + d), Math.max(1, product.stock)));

  return (
    <>
      <div className="qty" style={oos ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
        <button onClick={() => step(-1)} aria-label="Decrease"><Icon n="minus" s={16} /></button>
        <span>{qty}</span>
        <button onClick={() => step(1)} aria-label="Increase"><Icon n="plus" s={16} /></button>
      </div>
      <div className="acts">
        <button className="btn" disabled={oos} onClick={() => add(product, qty)}>Add to bag</button>
        <button className="btn ghost" disabled={oos} onClick={() => { if (add(product, qty)) router.push('/checkout'); }}>Buy now</button>
      </div>
      <button className="lnk" onClick={() => toggleWish(product.id)} style={{ marginBottom: 10 }}><Icon n="heart" s={16} /> <span>{inWish ? 'Saved to wishlist' : 'Add to wishlist'}</span></button>
      <div style={{ margin: '16px 0 26px' }}>
        <a className="btn ghost s" target="_blank" rel="noopener noreferrer" href={waLink(`Hi ${store.name} 👋 I'm interested in ${product.name}. Is it available?`)}><Icon n="chat" s={16} /> Ask on WhatsApp</a>
      </div>
    </>
  );
}
