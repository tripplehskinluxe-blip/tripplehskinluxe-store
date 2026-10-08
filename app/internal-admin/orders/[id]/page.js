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

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([sb.from('orders').select('*').eq('id', id).maybeSingle(), sb.from('order_items').select('id,name,qty,unit_price_ngn').eq('order_id', id)]);
    if (!a.data) { setMissing(true); return; }
    setO(a.data); setItems(b.data || []);
  }, [sb, id]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(v) {
    if (v === 'cancelled' && !confirm('Cancel this order? Stock will be put back if it was taken.')) return;
    const { error } = await sb.rpc('set_order_status', { p_order: id, p_status: v });
    if (error) { toast(/not paid/i.test(error.message) ? 'This order has not been paid yet' : 'Could not update the status'); return; }
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

  async function markRefunded() {
    const note = window.prompt('Paystack refund reference or a short note (optional):', '');
    if (note === null) return;
    const { error } = await sb.rpc('mark_order_refunded', { p_order: id, p_note: note.trim().slice(0, 200) });
    if (error) { toast('Could not mark as refunded. Check you are signed in as the owner.'); return; }
    toast('Marked as refunded'); load();
  }

  if (missing) return <><PageHead title="Order not found"><Link className="btn ghost s" href={`${base}/orders`}>Back</Link></PageHead></>;
  if (!o) return <p className="mut">Loading…</p>;
  const a = o.address || {};
  const wa = o.customer_phone ? `https://wa.me/${o.customer_phone.replace(/\D/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(`Hello ${o.customer_name}, this is about your order ${o.order_number}.`)}` : null;

  return (
    <>
      <PageHead title={o.order_number} sub={`${fmtDate(o.created_at)} · `}><Link className="btn ghost s" href={`${base}/orders`}>Back</Link></PageHead>
      {o.status === 'cancelled' && o.payment_status === 'paid' && (
        <div className="alert" style={{ display: 'block' }}>
          <b>Refund due.</b> This order was cancelled after the customer paid {naira(o.total_ngn)}. Refund them in your Paystack dashboard (or hand back the cash for an in-store sale), then record it here.
          <div style={{ marginTop: 10 }}>{role === 'admin' ? <button className="btn s" onClick={markRefunded}>Mark as refunded</button> : <span className="sm">Ask the shop owner to refund this and mark it as refunded.</span>}</div>
        </div>
      )}
      {o.needs_attention && !(o.status === 'cancelled' && o.payment_status === 'paid') && <div className="alert">This order needs attention: payment was received but an item sold out, the amount did not match, or a promo code went over its limit. Check Paystack and contact the customer.</div>}
      <div className="gr2">
        <div>
          <div className="pnl"><h3>Items</h3>
            {items.map((i) => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{i.name} <span className="mut">× {i.qty}</span></span><b>{naira(i.unit_price_ngn * i.qty)}</b></div>)}
            <dl className="kv" style={{ marginTop: 16 }}><dt>Subtotal</dt><dd>{naira(o.subtotal_ngn)}</dd><dt>Delivery</dt><dd>{naira(o.delivery_ngn)}</dd><dt>Discount</dt><dd>{o.discount_ngn ? `-${naira(o.discount_ngn)}${o.discount_code ? ` (${o.discount_code})` : ''}` : '—'}</dd><dt><b>Total</b></dt><dd><b>{naira(o.total_ngn)}</b></dd></dl>
          </div>
          <div className="pnl"><h3>Customer</h3>
            <dl className="kv"><dt>Name</dt><dd>{o.customer_name}</dd><dt>Phone</dt><dd>{o.customer_phone || '—'}</dd><dt>Email</dt><dd>{o.customer_email || '—'}</dd>
              {o.channel === 'online' && <><dt>Address</dt><dd>{[a.address, a.landmark, a.city, a.state].filter(Boolean).join(', ')}</dd>{a.notes && <><dt>Notes</dt><dd>{a.notes}</dd></>}</>}</dl>
            {wa && <a className="btn ghost s" style={{ marginTop: 14 }} href={wa} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>}
          </div>
        </div>
        <div className="pnl"><h3>Status</h3>
          <p style={{ marginBottom: 12 }}><ChannelPill c={o.channel} /> <Pill text={o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'refunded' ? 'Refunded' : o.payment_status === 'failed' ? 'Failed' : 'Unpaid'} /></p>
          <div className="fld"><label className="f">Order status</label>
            <select className="sel" value={o.status} onChange={(e) => setStatus(e.target.value)} disabled={o.status === 'cancelled'}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <p className="sm mut">Payment method: <b>{o.payment_method.replace(/_/g, ' ')}</b>{o.paid_at && <> · paid {fmtDate(o.paid_at)}</>}</p>
          {o.status === 'cancelled' && <p className="sm mut" style={{ marginTop: 10 }}>Cancelled orders can&apos;t be changed.</p>}
        </div>
      </div>
    </>
  );
}
