'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { naira, fmtDate } from '@/lib/format.js';

const STEPS = [['pending', 'Order Received'], ['processing', 'Processing'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out_for_delivery', 'Out for Delivery'], ['delivered', 'Delivered']];
const PICKUP_STEPS = [['pending', 'Order Received'], ['processing', 'Preparing'], ['ready_for_pickup', 'Ready for Pickup'], ['delivered', 'Collected']];

export default function TrackOrder() {
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setError(''); setRes(null); setConfirming(false); setCancelMsg(''); setPhone(String(fd.get('p') || ''));
    try {
      const r = await fetch('/api/orders/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: fd.get('o'), phone: fd.get('p') }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setRes(d); else setError(d.error || 'We could not find that order.');
    } catch { setError('Network error. Please try again.'); }
    setBusy(false);
  }
  async function cancelOrder() {
    setCancelBusy(true); setCancelMsg('');
    try {
      const r = await fetch('/api/orders/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: res.order_number, phone }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setRes({ ...res, status: 'cancelled', can_cancel: false, refund: d.refund === 'issued' ? 'issued' : d.refund === 'pending' ? 'pending' : null }); setConfirming(false); }
      else setCancelMsg(d.error || 'We could not cancel this order. Please message us on WhatsApp.');
    } catch { setCancelMsg('Network error. Please try again.'); }
    setCancelBusy(false);
  }
  const steps = res?.delivery_method === 'pickup' ? PICKUP_STEPS : STEPS;
  const cur = res ? steps.findIndex(([k]) => k === res.status) : -1;

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
            {res.status === 'cancelled' ? <div className="alert" style={{ marginTop: 16 }}>This order was cancelled.{res.refund === 'issued' && ' Your refund has been issued. It usually reaches you within 3 to 7 working days, depending on your bank.'}{res.refund === 'pending' && ' Your refund is being processed, and we will email you once it has been issued.'} Contact us on WhatsApp if you need help.</div> : (
              <div className="tl">
                {steps.map(([k, label], i) => (
                  <div key={k} className={`st ${i <= cur ? 'done' : ''} ${i === cur ? 'cur' : ''}`}><i>{i <= cur && <Icon n="check" s={15} />}</i><span>{label}</span></div>
                ))}
              </div>
            )}
            <p className="sm mut" style={{ marginTop: 10 }}>{res.items.map((i) => `${i.name} × ${i.qty}`).join(' · ')}</p>
            {res.can_cancel && (
              <div style={{ marginTop: 18 }}>
                {!confirming ? <button className="btn ghost s" onClick={() => setConfirming(true)}>Cancel this order</button> : (
                  <div className="alert" style={{ display: 'block' }}>
                    <b>Cancel this order?</b> This cannot be undone.{res.paid && ' Because you have paid, we will refund the full amount to your original payment method.'}
                    <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn s" disabled={cancelBusy} onClick={cancelOrder}>{cancelBusy ? 'Cancelling…' : 'Yes, cancel my order'}</button>
                      <button className="btn ghost s" onClick={() => setConfirming(false)}>No, keep it</button>
                    </div>
                  </div>
                )}
                {cancelMsg && <p className="sm" style={{ color: 'var(--err)', marginTop: 10 }}>{cancelMsg}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
