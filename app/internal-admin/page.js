'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, ChannelPill, Bars, statusLabel } from '@/components/admin/ui';
import { naira, fmtDate } from '@/lib/format.js';

const dayKey = (d) => new Date(d).toDateString();

export default function Dashboard() {
  const { sb, base } = useAdmin();
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 6 * 864e5); since.setHours(0, 0, 0, 0);
      const [o, p, low, pend, attn] = await Promise.all([
        sb.from('orders').select('id,order_number,created_at,total_ngn,channel,status,payment_status,customer_name').gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(1000),
        sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        sb.from('products').select('id,name,stock', { count: 'exact' }).eq('is_active', true).lt('stock', 5).order('stock').limit(6),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid').eq('status', 'processing'),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('needs_attention', true),
      ]);
      setD({ orders: o.data || [], products: p.count || 0, low: low.data || [], lowCount: low.count || 0, pending: pend.count || 0, attn: attn.count || 0 });
    })();
  }, [sb]);

  if (!d) return <p className="mut">Loading…</p>;
  const paid = d.orders.filter((o) => o.payment_status === 'paid' && o.status !== 'cancelled');
  const today = paid.filter((o) => dayKey(o.created_at) === dayKey(Date.now())).reduce((a, o) => a + o.total_ngn, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 864e5));
  const series = days.map((day) => paid.filter((o) => dayKey(o.created_at) === day.toDateString()).reduce((a, o) => a + o.total_ngn, 0));
  const sum = (c) => paid.filter((o) => o.channel === c).reduce((a, o) => a + o.total_ngn, 0);
  const on = sum('online'), st = sum('store'), tot = on + st || 1;

  return (
    <>
      <PageHead title="Dashboard" sub="Last 7 days, paid orders only." />
      {d.attn > 0 && <div className="alert">{d.attn} order{d.attn === 1 ? ' needs' : 's need'} attention (paid, but an item sold out or the amount didn&apos;t match). <Link className="lnk" style={{ marginLeft: 'auto' }} href={`${base}/orders?attention=1`}>Review</Link></div>}
      {d.lowCount > 0 && <div className="alert">{d.lowCount} product{d.lowCount === 1 ? ' is' : 's are'} running low on stock. <Link className="lnk" style={{ marginLeft: 'auto' }} href={`${base}/inventory`}>Review inventory</Link></div>}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat"><small>Today&apos;s sales</small><b>{naira(today)}</b></div>
        <div className="stat"><small>7-day sales</small><b>{naira(on + st)}</b></div>
        <div className="stat"><small>Paid, to be packed</small><b>{d.pending}</b></div>
        <div className="stat"><small>Active products</small><b>{d.products}</b></div>
      </div>
      <div className="gr2">
        <div className="pnl"><h3>Sales this week</h3><Bars values={series} labels={days.map((x) => x.toLocaleDateString('en-GB', { weekday: 'short' }))} /></div>
        <div className="pnl"><h3>Online vs in-store</h3>
          <div style={{ display: 'flex', height: 12, borderRadius: 8, overflow: 'hidden', background: 'var(--pm)', marginBottom: 14 }}><i style={{ width: `${(on / tot) * 100}%`, background: 'var(--p)' }} /><i style={{ width: `${(st / tot) * 100}%`, background: '#b58ae0' }} /></div>
          <p><span className="pill online">Online</span> <b style={{ marginLeft: 8 }}>{naira(on)}</b></p><p style={{ marginTop: 10 }}><span className="pill in-store">In-store</span> <b style={{ marginLeft: 8 }}>{naira(st)}</b></p>
          {d.low.length > 0 && <><h3 style={{ marginTop: 22 }}>Low stock</h3>{d.low.map((p) => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}><span>{p.name}</span><b>{p.stock}</b></div>)}</>}
        </div>
      </div>
      <div className="pnl"><h3>Recent orders <Link className="lnk sm" style={{ fontFamily: 'var(--sans)' }} href={`${base}/orders`}>View all</Link></h3>
        <div className="tw"><table className="t"><thead><tr><th>Order</th><th>Channel</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {d.orders.slice(0, 6).map((o) => <tr key={o.id}><td><Link className="lnk" href={`${base}/orders/${o.id}`}>{o.order_number}</Link></td><td><ChannelPill c={o.channel} /></td><td>{o.customer_name}</td><td>{fmtDate(o.created_at)}</td><td>{naira(o.total_ngn)}</td><td><Pill text={statusLabel(o.status)} /></td></tr>)}
          {!d.orders.length && <tr><td colSpan={6} className="mut">No orders yet.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
