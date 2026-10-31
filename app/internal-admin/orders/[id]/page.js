'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, ChannelPill, STATUS, statusLabel } from '@/components/admin/ui';
import { naira, fmtDate } from '@/lib/format.js';

export default function OrderDetail() {
  const { id } = useParams();
  const { sb, base, toast, token, role } = useAdmin();
  const [o, setO] = useState(null);
  const [items, setItems] = useState([]);
  const [missing, setMissing] = useState(false);
  const [refund, setRefund] = useState(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([sb.from('orders').select('*').eq('id', id).maybeSingle(), sb.from('order_items').select('id,name,qty,unit_price_ngn').eq('order_id', id), sb.from('order_refunds').select('status,error,attempts').eq('order_id', id).maybeSingle()]);
    if (!a.data) { setMissing(true); return; }
    setO(a.data); setItems(b.data || []); setRefund(c.data || null);
  }, [sb, id]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(v) {
    if (v === 'cancelled') {
      if (!confirm('Cancel this order? Stock is put back, the customer is emailed, and a paid online order is refunded automatically through Paystack.')) return;
      try {
        const r = await fetch('/api/admin/orders/cancel', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast(d.error || 'Could not cancel the order'); return; }
        toast(d.refund === 'issued' ? 'Order cancelled · refund issued · customer emailed' : d.refund === 'pending' ? 'Order cancelled · the refund did not go through yet, see below' : 'Order cancelled');
      } catch { toast('Could not cancel the order'); }
      load(); return;
    }
    const { error } = await sb.rpc('set_order_status', { p_order: id, p_status: v });
    if (error) { toast(/not paid/i.test(error.message) ? 'This order has not been paid yet' : /pickup/i.test(error.message) ? error.message : 'Could not update the status'); return; }
    toast('Status updated'); load();
    // Tell the customer (online orders; shipped / out for delivery / delivered). Sent once per status, only if email is set up.
    if (o.channel === 'online') {
      try {
        const r = await fetch('/api/admin/orders/notify', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.result === 'sent') toast('Status updated · customer emailed');
        else if (!r.ok) toast('Status updated, but the customer email failed');
      } catch { toast('Status updated, but the customer email failed'); }
    }
  }

  async function retryRefund() {
    try {
      const r = await fetch('/api/admin/orders/refund', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id }) });
      const d = await r.json().catch(() => ({}));
      toast(r.ok && d.refund === 'issued' ? 'Refund issued · customer emailed' : d.error || 'The refund did not go through. Check the reason shown on this page.');
    } catch { toast('Could not reach the server'); }
    load();
  }

  async function markRefunded() {
    const note = window.prompt('Paystack refund reference or a short note (optional):', '');
    if (note === null) return;
    const { error } = await sb.rpc('mark_order_refunded', { p_order: id, p_note: note.trim().slice(0, 200) });
    if (error) { toast('Could not mark as refunded. Check you are signed in as the owner.'); return; }
    toast('Marked as refunded'); load();
    if (o.channel === 'online') { try { await fetch('/api/admin/orders/notify', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id, kind: 'refund' }) }); } catch { /* the refund is recorded either way */ } }
  }

  if (missing) return <><PageHead title="Order not found"><Link className="btn ghost s" href={`${base}/orders`}>Back</Link></PageHead></>;
  if (!o) return <p className="mut">Loading…</p>;
  const a = o.address || {};
  const pickup = o.delivery_method === 'pickup';
  const options = pickup ? STATUS.filter(([v]) => ['pending', 'processing', 'ready_for_pickup', 'delivered', 'cancelled'].includes(v)) : STATUS.filter(([v]) => v !== 'ready_for_pickup');
  const wa = o.customer_phone ? `https://wa.me/${o.customer_phone.replace(/\D/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(`Hello ${o.customer_name}, this is about your order ${o.order_number}.`)}` : null;

  return (
    <>
      <PageHead title={o.order_number} sub={`${fmtDate(o.created_at)} · `}><Link className="btn ghost s" href={`${base}/orders`}>Back</Link></PageHead>
      {o.status === 'cancelled' && o.payment_status === 'paid' && (
        <div className="alert" style={{ display: 'block' }}>
          <b>Refund due.</b> This order was cancelled after the customer paid {naira(o.total_ngn)}.
          {o.channel === 'online' ? <>
            {refund?.status === 'failed' && <><br />The automatic refund did not go through: {refund.error || 'unknown reason'}.</>}
            {refund?.status === 'processing' && <><br />A refund request is in progress. Check again in a minute.</>}
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn s" onClick={retryRefund}>{refund?.status === 'failed' ? 'Retry refund' : 'Refund now'}</button>
              {role === 'admin' ? <button className="btn ghost s" onClick={markRefunded}>Already refunded in Paystack? Mark as refunded</button> : <span className="sm">Refunded outside Paystack? Ask the shop owner to mark it.</span>}
            </div>
          </> : <>
            {' '}Hand back the cash for this in-store sale, then record it here.
            <div style={{ marginTop: 10 }}>{role === 'admin' ? <button className="btn s" onClick={markRefunded}>Mark as refunded</button> : <span className="sm">Ask the shop owner to refund this and mark it as refunded.</span>}</div>
          </>}
        </div>
      )}
      {o.status === 'cancelled' && o.payment_status === 'refunded' && o.channel === 'online' && <div className="alert" style={{ display: 'block', background: '#e7f3ea', borderColor: '#c6e0cc', color: '#25613a' }}>Refund issued ({naira(o.total_ngn)}){refund?.status === 'processed' ? ' and completed by Paystack.' : '. Paystack is processing it, and it can take a few working days to reach the customer.'}</div>}
      {o.needs_attention && !(o.status === 'cancelled' && o.payment_status === 'paid') && <div className="alert">This order needs attention: payment was received but an item sold out, the amount did not match, or a promo code went over its limit. Check Paystack and contact the customer.{o.attention_reason && <><br /><b>Reason:</b> {o.attention_reason}</>}</div>}
      <div className="gr2">
        <div>
          <div className="pnl"><h3>Items</h3>
            {items.map((i) => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{i.name} <span className="mut">× {i.qty}</span></span><b>{naira(i.unit_price_ngn * i.qty)}</b></div>)}
            <dl className="kv" style={{ marginTop: 16 }}><dt>Subtotal</dt><dd>{naira(o.subtotal_ngn)}</dd><dt>{pickup ? 'Store pickup' : 'Delivery'}</dt><dd>{pickup ? 'Free' : naira(o.delivery_ngn)}</dd><dt>Discount</dt><dd>{o.discount_ngn ? `-${naira(o.discount_ngn)}${o.discount_code ? ` (${o.discount_code})` : ''}` : 'None'}</dd><dt><b>Total</b></dt><dd><b>{naira(o.total_ngn)}</b></dd></dl>
          </div>
          <div className="pnl"><h3>Customer</h3>
            <dl className="kv"><dt>Name</dt><dd>{o.customer_name}</dd><dt>Phone</dt><dd>{o.customer_phone || 'None'}</dd><dt>Email</dt><dd>{o.customer_email || 'None'}</dd>
              {o.channel === 'online' && (pickup ? <><dt>Receiving</dt><dd><b>Store pickup</b>: collect at {a.address || 'the shop'}</dd></> : <><dt>Address</dt><dd>{[a.address, a.landmark, a.city, a.state].filter(Boolean).join(', ')}</dd>{a.notes && <><dt>Notes</dt><dd>{a.notes}</dd></>}</>)}</dl>
            {wa && <a className="btn ghost s" style={{ marginTop: 14 }} href={wa} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>}
          </div>
        </div>
        <div className="pnl"><h3>Status</h3>
          <p style={{ marginBottom: 12 }}><ChannelPill c={o.channel} /> <Pill text={o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'refunded' ? 'Refunded' : o.payment_status === 'failed' ? 'Failed' : 'Unpaid'} /></p>
          <div className="fld"><label className="f">Order status</label>
            <select className="sel" value={o.status} onChange={(e) => setStatus(e.target.value)} disabled={o.status === 'cancelled'}>{options.map(([v, l]) => <option key={v} value={v}>{v === 'delivered' && pickup ? 'Collected' : l}</option>)}</select></div>
          {pickup && o.status !== 'cancelled' && (
            <div className="pnl" style={{ background: 'var(--ps)', margin: '14px 0' }}>
              <p style={{ marginBottom: 8 }}><b>Store pickup</b> · free · ready within 48 hours</p>
              {o.payment_status !== 'paid' && <p className="sm mut">Waiting for payment. It can be marked ready once it is paid.</p>}
              {o.payment_status === 'paid' && o.status === 'processing' && <button className="btn s" onClick={() => setStatus('ready_for_pickup')}>Mark ready for pickup</button>}
              {o.status === 'ready_for_pickup' && <>
                <p style={{ marginBottom: 8 }}>Ready ✓ The customer has been emailed. Pickup code: <b style={{ fontSize: 18, letterSpacing: '.08em' }}>{o.pickup_code}</b><br /><span className="sm mut">Ask the customer to show this code, then mark it as collected.</span></p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="btn s" onClick={() => setStatus('delivered')}>Mark as collected</button><button className="btn ghost s" onClick={() => setStatus('processing')}>Not ready</button></div>
              </>}
            </div>
          )}
          <p className="sm mut">Payment method: <b>{o.payment_method.replace(/_/g, ' ')}</b>{o.paid_at && <> · paid {fmtDate(o.paid_at)}</>}</p>
          {o.status === 'cancelled' && <p className="sm mut" style={{ marginTop: 10 }}>Cancelled orders can&apos;t be changed.</p>}
        </div>
      </div>
    </>
  );
}
