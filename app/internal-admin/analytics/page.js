'use client';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Bars, AdminOnly } from '@/components/admin/ui';
import { naira } from '@/lib/format.js';

const DAY = 864e5;
const key = (d) => new Date(d).toDateString();
const lab = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Inner() {
  const { sb, toast } = useAdmin();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    (async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setTime(start.getTime() - (days - 1) * DAY);
      const since = start.toISOString();
      const [o, it] = await Promise.all([
        sb.from('orders').select('total_ngn,created_at,channel,status,payment_status,customer_id').gte('created_at', since).limit(5000),
        sb.from('order_items').select('name,qty,unit_price_ngn,orders!inner(created_at,status,payment_status),products(categories(name))').gte('orders.created_at', since).eq('orders.payment_status', 'paid').neq('orders.status', 'cancelled').limit(5000),
      ]);
      if (o.error || it.error) { toast('Could not load analytics'); setD({ empty: true }); return; }
      setD({ start, orders: o.data.filter((x) => x.payment_status === 'paid' && x.status !== 'cancelled'), items: it.data });
    })();
  }, [sb, days, toast]);

  if (!d) return <><PageHead title="Analytics" /><p className="mut">Loading…</p></>;
  if (d.empty) return <PageHead title="Analytics" sub="Nothing to show yet." />;

  const revenue = d.orders.reduce((a, o) => a + o.total_ngn, 0);
  const aov = d.orders.length ? revenue / d.orders.length : 0;
  const customers = new Set(d.orders.map((o) => o.customer_id).filter(Boolean)).size;
  const weekly = days > 30;
  const n = weekly ? Math.ceil(days / 7) : days;
  const rev = Array(n).fill(0);
  d.orders.forEach((o) => {
    const idx = weekly ? n - 1 - Math.floor((Date.now() - new Date(o.created_at).getTime()) / (7 * DAY)) : Math.floor((new Date(o.created_at).setHours(0, 0, 0, 0) - d.start.getTime()) / DAY);
    if (idx >= 0 && idx < n) rev[idx] += o.total_ngn;
  });
  const labels = rev.map((_, i) => { const dt = new Date(weekly ? Date.now() - (n - 1 - i) * 7 * DAY : d.start.getTime() + i * DAY); const every = weekly ? 2 : days <= 7 ? 1 : 5; return i % every === 0 ? (days <= 7 ? dt.toLocaleDateString('en-GB', { weekday: 'short' }) : lab(dt)) : ''; });
  const split = (c) => d.orders.filter((o) => o.channel === c).reduce((a, o) => a + o.total_ngn, 0);
  const on = split('online'), st = split('store'), tot = on + st || 1;
  const top = {}, cats = {};
  d.items.forEach((x) => { const t = (top[x.name] ||= { qty: 0, rev: 0 }); t.qty += x.qty; t.rev += x.qty * x.unit_price_ngn; const c = x.products?.categories?.name || 'Other'; cats[c] = (cats[c] || 0) + x.qty * x.unit_price_ngn; });
  const topList = Object.entries(top).sort((a, b) => b[1].rev - a[1].rev).slice(0, 8);
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const catTot = catList.reduce((a, [, v]) => a + v, 0) || 1;

  return (
    <>
      <PageHead title="Analytics" sub="Paid, non-cancelled orders only."><select className="sel" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Date range"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></PageHead>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat"><small>Revenue</small><b>{naira(revenue)}</b></div><div className="stat"><small>Orders</small><b>{d.orders.length}</b></div>
        <div className="stat"><small>Average order</small><b>{naira(aov)}</b></div><div className="stat"><small>Known customers</small><b>{customers}</b></div>
      </div>
      <div className="gr2">
        <div className="pnl"><h3>Revenue {weekly ? 'by week' : 'by day'}</h3><Bars values={rev} labels={labels} /></div>
        <div className="pnl"><h3>Online vs in-store</h3>
          <div style={{ display: 'flex', height: 12, borderRadius: 8, overflow: 'hidden', background: 'var(--pm)', marginBottom: 14 }}><i style={{ width: `${(on / tot) * 100}%`, background: 'var(--p)' }} /><i style={{ width: `${(st / tot) * 100}%`, background: '#b58ae0' }} /></div>
          <p><span className="pill online">Online</span> <b style={{ marginLeft: 8 }}>{naira(on)}</b></p><p style={{ marginTop: 10 }}><span className="pill in-store">In-store</span> <b style={{ marginLeft: 8 }}>{naira(st)}</b></p>
          <h3 style={{ marginTop: 22 }}>Categories</h3>
          {catList.map(([c, v]) => <div key={c} style={{ margin: '10px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{c}</span><b>{Math.round((v / catTot) * 100)}%</b></div><div className="prog" style={{ margin: '4px 0 0' }}><i style={{ width: `${(v / catTot) * 100}%` }} /></div></div>)}
          {!catList.length && <p className="mut">No sales in this period.</p>}
        </div>
      </div>
      <div className="pnl"><h3>Top products</h3>
        {topList.map(([name, t], i) => <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{i + 1}. {name}</span><span><b>{naira(t.rev)}</b> <span className="mut sm">· {t.qty} sold</span></span></div>)}
        {!topList.length && <p className="mut">No sales in this period.</p>}
      </div>
    </>
  );
}
export default function Analytics() { return <AdminOnly><Inner /></AdminOnly>; }
