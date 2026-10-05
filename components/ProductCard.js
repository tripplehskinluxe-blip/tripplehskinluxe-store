'use client';
import Link from 'next/link';
import ProductArt from './ProductArt';
import Stars from './Stars';
import Icon from './Icon';
import { useCart } from './CartProvider';
import { naira } from '@/lib/format.js';

export default function ProductCard({ p }) {
  const { add, wish, toggleWish } = useCart();
  const oos = p.stock <= 0;
  const href = `/product/${p.slug}`;
  return (
    <article className="card">
      <div className="media">
        <Link href={href} className="s1" style={{ display: 'block', height: '100%' }}><ProductArt product={p} variant={0} /></Link>
        <Link href={href} className="s2" tabIndex={-1} aria-hidden="true"><ProductArt product={p} variant={1} /></Link>
        <div className="bdgs">
          {oos && <span className="bdg out">Out of stock</span>}
          {p.discount > 0 && <span className="bdg sale">-{p.discount}%</span>}
          {p.isNew && <span className="bdg new">New</span>}
        </div>
        <button className={`hrt ${wish.includes(p.id) ? 'on' : ''}`} onClick={() => toggleWish(p.id)} aria-label="Add to wishlist"><Icon n="heart" s={18} /></button>
      </div>
      <div className="cbody">
        <span className="brand">{p.brand}</span>
        <Link className="pname" href={href}>{p.name}</Link>
        <div className="rt">{p.reviewCount ? (<><Stars value={p.rating} /><span>{p.rating} ({p.reviewCount})</span></>) : <span>No reviews yet</span>}</div>
        <div className="price"><b>{naira(p.price)}</b>{p.oldPrice > 0 && <s>{naira(p.oldPrice)}</s>}</div>
        <button className="btn s" onClick={() => add(p)} disabled={oos}>{oos ? 'Out of stock' : 'Add to bag'}</button>
      </div>
    </article>
  );
}
