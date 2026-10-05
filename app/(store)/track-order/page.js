'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { naira, fmtDate } from '@/lib/format.js';

const STEPS = [['pending', 'Order Received'], ['processing', 'Processing'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out_for_delivery', 'Out for Delivery'], ['delivered', 'Delivered']];

export default function TrackOrder() {
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setError(''); setRes(null);
    try {
      const r = await fetch('/api/orders/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: fd.get('o'), phone: fd.get('p') }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setRes(d); else setError(d.error || 'We could not find that order.');
    } catch { setError('Network error. Please try again.'); }
    setBusy(false);
  }
  const cur = res ? STEPS.findIndex(([k]) => k === res.status) : -1;

  return (
    <>
      <div className="ph"><div className="container"><h1>Track your order</h1><p>Enter your order number and the phone number you used at checkout.</p></div></div>
      <div className="container" style={{ maxWidth: 720, padding: '36px 20px 90px' }}>
        <form className="box" onSubmit={submit}>
          <div className="fld"><label className="f" htmlFor="o">Order number</label><input id="o" className="inp" name="o" placeholder="ONL-2026-1048" required /></div>
          <div className="fld"><label className="f" htmlFor="p">Phone number</label><input id="p" className="inp" name="p" type="tel" placeholder="0801 234 5678" required /></div>
          <button className="btn block" disabled={busy}>{busy ? 'Checking…' : 'Track order'}</button>
        </form>
        {error && <div className="alert" style={{ marginTop: 22, background: '#fbe3e3', borderColor: '#efc8c8', color: 'var(--err)' }}>{error}</div>}
        {res && (
          <div className="box" style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div><b style={{ fontSize: 18 }}>{res.order_number}</b><br /><span className="mut sm">Placed {fmtDate(res.created_at)} · {naira(res.total)}</span></div>
            </div>
            {res.status === 'cancelled' ? <div className="alert" style={{ marginTop: 16 }}>This order was cancelled. Contact us on WhatsApp if you need help.</div> : (
              <div className="tl">
                {STEPS.map(([k, label], i) => (
                  <div key={k} className={`st ${i <= cur ? 'done' : ''} ${i === cur ? 'cur' : ''}`}><i>{i <= cur && <Icon n="check" s={15} />}</i><span>{label}</span></div>
                ))}
              </div>
            )}
            <p className="sm mut" style={{ marginTop: 10 }}>{res.items.map((i) => `${i.name} × ${i.qty}`).join(' · ')}</p>
          </div>
        )}
      </div>
    </>
  );
}
