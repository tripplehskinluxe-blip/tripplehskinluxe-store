'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useCart } from '@/components/CartProvider';
import { naira } from '@/lib/format.js';
import { useSettings } from '@/components/SettingsProvider';

function Inner() {
  const sp = useSearchParams();
  const ref = sp.get('reference') || '';
  const demo = sp.get('demo') === '1';
  const { clear } = useCart();
  const [s, setS] = useState({ phase: 'loading' });

  useEffect(() => {
    if (demo) {
      try { const o = JSON.parse(sessionStorage.getItem('ths_demo_order') || 'null'); setS(o ? { phase: 'demo', order: o } : { phase: 'missing' }); } catch { setS({ phase: 'missing' }); }
      return;
    }
    if (!ref) { setS({ phase: 'missing' }); return; }
    let tries = 0, stop = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/orders/status?reference=' + encodeURIComponent(ref));
        const d = await r.json();
        if (!stop && r.ok) {
          if (d.payment_status === 'paid') { clear(); localStorage.removeItem('ths_promo'); setS({ phase: 'paid', order: d }); return; }
          if (d.payment_status === 'failed') { setS({ phase: 'failed', order: d }); return; }
        }
      } catch {}
      if (stop) return;
      if (++tries < 12) setTimeout(tick, 3000); else setS({ phase: 'pending' });
    };
    tick();
    return () => { stop = true; };
  }, [ref, demo]);

  const { store, delivery, waLink } = useSettings();
  const wa = (n) => waLink(`Hello ${store.name} 👋 I have a question about order ${n}.`);
  if (s.phase === 'loading') return <div className="container center" style={{ padding: '110px 20px' }}><h2>Confirming your payment…</h2><p className="mut" style={{ marginTop: 10 }}>This usually takes a few seconds. Please don&apos;t close this page.</p></div>;
  if (s.phase === 'missing') return <div className="container"><div className="empty" style={{ padding: '110px 0' }}><h3>We couldn&apos;t find that order</h3><p>If you were charged, message us and we&apos;ll sort it out.</p><a className="btn" href={wa('')} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></div></div>;
  if (s.phase === 'failed') return <div className="container"><div className="empty" style={{ padding: '110px 0' }}><h3>Payment didn&apos;t go through</h3><p>No money was taken for order {s.order.order_number}. You can try again.</p><Link className="btn" href="/cart">Back to bag</Link></div></div>;
  if (s.phase === 'pending') return <div className="container"><div className="empty" style={{ padding: '110px 0' }}><h3>Still confirming…</h3><p>Your payment is taking longer than usual. We&apos;ll email you as soon as it&apos;s confirmed. You can also check with us on WhatsApp.</p><a className="btn" href={wa('')} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></div></div>;

  const o = s.order;
  const num = demo ? o.number : o.order_number;
  return (
    <div className="container" style={{ maxWidth: 780, padding: '56px 20px 90px' }}>
      <div className="center"><div className="ok-ic"><Icon n="check" s={34} /></div><h1 style={{ fontSize: 'clamp(34px,5vw,52px)' }}>Order confirmed!</h1><p className="mut" style={{ marginTop: 8 }}>Thank you for shopping with {store.name}.</p></div>
      <div className="box" style={{ marginTop: 30 }}>
        <div className="kv">
          <dt>Order number</dt><dd><b>{num}</b></dd>
          {demo && <><dt>Delivering to</dt><dd>{o.address}, {o.city}, {o.state}</dd></>}
          <dt>Estimated delivery</dt><dd>{delivery.lagosDays} in Lagos · {delivery.otherDays} nationwide</dd>
        </div>
        {demo && <div style={{ marginTop: 22 }}>
          {o.items.map((i) => <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}><span>{i.name} × {i.qty}</span><span>{naira(i.price * i.qty)}</span></div>)}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, fontSize: 19, fontWeight: 600 }}><span>Total</span><span>{naira(o.total)}</span></div>
          <p className="sm mut" style={{ marginTop: 14 }}>Demo order: no payment was taken and nothing was saved.</p>
        </div>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
        {!demo && <Link className="btn" href="/track-order">Track order</Link>}
        <Link className="btn ghost" href="/shop">Continue shopping</Link>
        <a className="btn ghost" target="_blank" rel="noopener noreferrer" href={wa(num)}>Chat on WhatsApp</a>
      </div>
    </div>
  );
}

export default function Confirmation() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
