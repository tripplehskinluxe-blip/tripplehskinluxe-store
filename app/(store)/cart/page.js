'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ProductArt from '@/components/ProductArt';
import Icon from '@/components/Icon';
import { useCart } from '@/components/CartProvider';
import { useCartLines, totalsFor } from '@/components/useCartLines';
import { naira } from '@/lib/format.js';
import { useSettings } from '@/components/SettingsProvider';

export default function CartPage() {
  const { delivery } = useSettings();
  const { setQty, remove, toast, count } = useCart();
  const { lines, loading } = useCartLines();
  const [zone, setZone] = useState('lagos');
  const [promo, setPromo] = useState(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    setZone(localStorage.getItem('ths_zone') || 'lagos');
    try { const p = JSON.parse(localStorage.getItem('ths_promo') || 'null'); if (p) { setPromo(p); setCode(p.code); } } catch {}
  }, []);

  const t = totalsFor(lines, promo, zone, delivery);
  const left = Math.max(0, delivery.freeThreshold - (t.subtotal - t.discount));

  async function apply(e) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) { setPromo(null); localStorage.removeItem('ths_promo'); return; }
    const r = await fetch('/api/discount/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.discount) { toast("That code isn't valid"); return; }
    if (t.subtotal <= d.discount.min_order_ngn) { toast(`Spend over ${naira(d.discount.min_order_ngn)} to use ${c}`); return; }
    setPromo(d.discount); localStorage.setItem('ths_promo', JSON.stringify(d.discount)); toast('Promo code applied');
  }

  if (loading) return <div className="container"><p className="mut center" style={{ padding: '90px 0' }}>Loading your bag…</p></div>;
  if (!lines.length) return (
    <div className="container"><div className="empty" style={{ padding: '110px 0' }}>
      <h3>Your bag is empty</h3><p>Add something you love and it will show up here.</p><Link className="btn" href="/shop">Continue shopping</Link>
    </div></div>
  );

  return (
    <>
      <div className="ph"><div className="container"><h1>Shopping bag</h1><p>{count} item{count === 1 ? '' : 's'}</p></div></div>
      <div className="container"><div className="two">
        <div>
          {lines.map(({ p, qty }) => (
            <div className="line" key={p.id}>
              <Link className="media" href={`/product/${p.slug}`}><ProductArt product={p} /></Link>
              <div><span className="brand">{p.brand}</span><br /><Link className="pname" href={`/product/${p.slug}`}>{p.name}</Link><div className="price" style={{ margin: '4px 0 0' }}><b>{naira(p.price)}</b></div>{p.stock < qty && <span className="err">Only {p.stock} left</span>}</div>
              <div className="r">
                <div className="qty"><button onClick={() => setQty(p.id, qty - 1, p.stock)} aria-label="Decrease"><Icon n="minus" s={16} /></button><span>{qty}</span><button onClick={() => setQty(p.id, qty + 1, p.stock)} aria-label="Increase"><Icon n="plus" s={16} /></button></div>
                <b>{naira(p.price * qty)}</b>
                <button className="lnk sm" onClick={() => remove(p.id)} style={{ color: 'var(--err)', borderColor: '#efc8c8' }}><Icon n="trash" s={14} /> Remove</button>
              </div>
            </div>
          ))}
          <Link className="lnk" href="/shop" style={{ marginTop: 22 }}>Continue shopping</Link>
        </div>
        <aside className="sum">
          <h3 style={{ marginBottom: 14 }}>Order summary</h3>
          <div className="fld"><label className="f">Deliver to</label>
            <select className="sel" value={zone} onChange={(e) => { setZone(e.target.value); localStorage.setItem('ths_zone', e.target.value); }}><option value="lagos">Lagos</option><option value="other">Outside Lagos</option></select></div>
          <form className="promo" onSubmit={apply}>
            <input className="inp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter promo code" style={{ textTransform: 'uppercase' }} aria-label="Promo code" />
            <button className="btn s">Apply</button>
          </form>
          <div className="r"><span>Subtotal</span><span>{naira(t.subtotal)}</span></div>
          <div className="r"><span>Delivery</span><span>{t.delivery ? naira(t.delivery) : 'Free'}</span></div>
          <div className="r" style={{ color: 'var(--ok)' }}><span>Discount{t.discountCode ? ` (${t.discountCode})` : ''}</span><span>{t.discount ? '-' + naira(t.discount) : naira(0)}</span></div>
          <div className="r tot"><span>Total</span><span>{naira(t.total)}</span></div>
          {zone === 'lagos' && (left > 0
            ? <><div className="prog"><i style={{ width: `${Math.min(100, ((t.subtotal - t.discount) / delivery.freeThreshold) * 100)}%` }} /></div><p className="sm mut">Add {naira(left)} more for free Lagos delivery</p></>
            : <p className="sm" style={{ color: 'var(--ok)', marginTop: 10 }}>You&apos;ve unlocked free Lagos delivery</p>)}
          <Link className="btn block" style={{ marginTop: 18 }} href="/checkout">Proceed to checkout</Link>
          <p className="sm mut" style={{ marginTop: 10 }}>Final prices are confirmed securely at checkout.</p>
        </aside>
      </div></div>
    </>
  );
}
