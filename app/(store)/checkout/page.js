'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ProductArt from '@/components/ProductArt';
import Icon from '@/components/Icon';
import { useCart } from '@/components/CartProvider';
import { useCartLines, totalsFor } from '@/components/useCartLines';
import { useSettings } from '@/components/SettingsProvider';
import { naira } from '@/lib/format.js';

const STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

export default function Checkout() {
  const router = useRouter();
  const { cart, clear, toast } = useCart();
  const { lines, loading } = useCartLines();
  const { delivery } = useSettings();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [promo, setPromo] = useState(null);
  const [d, setD] = useState({ name: '', email: '', phone: '', state: 'Lagos', city: '', address: '', landmark: '', notes: '' });

  useEffect(() => { try { setPromo(JSON.parse(localStorage.getItem('ths_promo') || 'null')); } catch {} }, []);
  const set = (k) => (e) => { setD({ ...d, [k]: e.target.value }); if (err[k]) setErr({ ...err, [k]: undefined }); };
  const t = totalsFor(lines, promo, d.state === 'Lagos' ? 'lagos' : 'other', delivery);

  const validate = (s) => {
    const e = {};
    if (s === 1) {
      if (d.name.trim().length < 3) e.name = 'Enter your full name';
      if (!/^\S+@\S+\.\S+$/.test(d.email)) e.email = 'Enter a valid email address';
      if (d.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number';
    }
    if (s === 2) {
      if (!d.city.trim()) e.city = 'Enter your city or area';
      if (!d.address.trim()) e.address = 'Enter your street address';
    }
    return e;
  };
  const next = () => { const e = validate(step); setErr(e); if (!Object.keys(e).length) { setStep(step + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const goto = (s) => { for (let i = 1; i < s; i++) { const e = validate(i); if (Object.keys(e).length) { setErr(e); setStep(i); return; } } setErr({}); setStep(s); };

  async function place() {
    for (const s of [1, 2]) { const e = validate(s); if (Object.keys(e).length) { setErr(e); setStep(s); toast('Please complete the highlighted fields'); return; } }
    setBusy(true);
    try {
      const r = await fetch('/api/paystack/initialize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((c) => ({ product_id: c.id, qty: c.qty })),
          customer: { name: d.name, email: d.email, phone: d.phone },
          address: { state: d.state, city: d.city, address: d.address, landmark: d.landmark, notes: d.notes },
          discount_code: promo?.code || '',
          expected_total: t.total,        // the server refuses to charge a different amount than the one shown here
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 503 && data.demo) {
        // No payment backend connected yet: show a demo confirmation so the flow can be reviewed.
        const order = { number: 'DEMO-' + String(Date.now()).slice(-6), total: t.total, name: d.name, state: d.state, city: d.city, address: d.address, items: lines.map((l) => ({ name: l.p.name, qty: l.qty, price: l.p.price })) };
        sessionStorage.setItem('ths_demo_order', JSON.stringify(order));
        clear(); router.push('/order/confirmation?demo=1'); return;
      }
      if (r.status === 409 && (data.code === 'PRICE_CHANGED' || data.code === 'PROMO_INVALID')) { toast(data.error); setBusy(false); setTimeout(() => window.location.reload(), 2500); return; }
      if (!r.ok) { toast(data.error || 'We could not place your order'); setBusy(false); return; }
      window.location.href = data.authorization_url; // Paystack's hosted payment page. The bag is cleared once payment is confirmed.
    } catch { toast('Network error. Please try again.'); setBusy(false); }
  }

  const field = (k, label, type = 'text', ph = '') => (
    <div className="fld"><label className="f" htmlFor={`c_${k}`}>{label}</label>
      <input id={`c_${k}`} className={`inp ${err[k] ? 'bad' : ''}`} type={type} value={d[k]} onChange={set(k)} placeholder={ph} autoComplete={k} />
      {err[k] && <span className="err">{err[k]}</span>}</div>
  );

  if (loading) return <div className="container"><p className="mut center" style={{ padding: '90px 0' }}>Loading…</p></div>;
  if (!lines.length) return <div className="container"><div className="empty" style={{ padding: '110px 0' }}><h3>Your bag is empty</h3><p>Add something to your bag before checking out.</p><Link className="btn" href="/shop">Continue shopping</Link></div></div>;

  const summary = (
    <>
      <h3 style={{ marginBottom: 12 }}>Order summary</h3>
      {lines.map(({ p, qty }) => (
        <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
          <div className="media" style={{ width: 54, flexShrink: 0, borderRadius: 10 }}><ProductArt product={p} /></div>
          <div style={{ flex: 1, fontSize: 14, lineHeight: 1.3 }}>{p.name}<br /><span className="mut sm">Qty {qty}</span></div>
          <b style={{ fontSize: 14 }}>{naira(p.price * qty)}</b>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--pm)', marginTop: 10, paddingTop: 8 }}>
        <div className="r"><span>Subtotal</span><span>{naira(t.subtotal)}</span></div>
        <div className="r"><span>Delivery</span><span>{t.delivery ? naira(t.delivery) : 'Free'}</span></div>
        {t.discount > 0 && <div className="r" style={{ color: 'var(--ok)' }}><span>Discount ({t.discountCode})</span><span>-{naira(t.discount)}</span></div>}
        <div className="r tot"><span>Total</span><span>{naira(t.total)}</span></div>
      </div>
      <p className="sm mut" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Icon n="lock" s={14} /> Secure checkout</p>
    </>
  );

  return (
    <>
      <div className="ph"><div className="container"><h1>Checkout</h1><p>Secure checkout, powered by Paystack</p></div></div>
      <div className="container"><div className="two">
        <div>
          <details className="sum ck-m"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Order summary · {naira(t.total)} <span className="mut sm">(tap to view)</span></summary><div style={{ marginTop: 14 }}>{summary}</div></details>
          <div className="steps">
            {['Details', 'Delivery', 'Payment'].map((l, i) => (
              <button key={l} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} onClick={() => goto(i + 1)}><b>{step > i + 1 ? <Icon n="check" s={13} /> : i + 1}</b><span>{l}</span></button>
            ))}
          </div>
          <div className="box">
            {step === 1 && <>
              <h3 style={{ marginBottom: 18 }}>Customer details</h3>
              {field('name', 'Full name', 'text', 'e.g. Amaka Okafor')}{field('email', 'Email', 'email', 'you@example.com')}{field('phone', 'Phone', 'tel', '0801 234 5678')}
              <button className="btn" onClick={next}>Continue to delivery</button>
            </>}
            {step === 2 && <>
              <h3 style={{ marginBottom: 18 }}>Delivery</h3>
              <div className="fld"><label className="f" htmlFor="c_state">State</label><select id="c_state" className="sel" value={d.state} onChange={set('state')}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div className="row2">{field('city', 'City / Area')}{field('landmark', 'Apartment / Landmark')}</div>
              {field('address', 'Street address')}
              <div className="fld"><label className="f" htmlFor="c_notes">Delivery notes (optional)</label><textarea id="c_notes" className="inp" rows={3} value={d.notes} onChange={set('notes')} /></div>
              <div style={{ display: 'flex', gap: 10 }}><button className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn" onClick={next}>Continue to payment</button></div>
            </>}
            {step === 3 && <>
              <h3 style={{ marginBottom: 18 }}>Payment</h3>
              <label className="pay"><input type="radio" checked readOnly /><span><b>Pay securely with Paystack</b><small>Card, bank transfer or USSD on Paystack&apos;s secure page. We never see your card details.</small></span></label>
              <p className="sm mut" style={{ margin: '16px 0', display: 'flex', gap: 6, alignItems: 'center' }}><Icon n="lock" s={14} /> You&apos;ll be redirected to Paystack to complete payment.</p>
              <p className="sm mut" style={{ margin: '12px 0' }}>By paying you agree to our <Link href="/terms" target="_blank">Terms of Sale</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</p>
              <div style={{ display: 'flex', gap: 10 }}><button className="btn ghost" onClick={() => setStep(2)}>Back</button><button className="btn" onClick={place} disabled={busy}>{busy ? 'Please wait…' : `Pay ${naira(t.total)}`}</button></div>
            </>}
          </div>
        </div>
        <aside className="sum ck-d">{summary}</aside>
      </div></div>
    </>
  );
}
