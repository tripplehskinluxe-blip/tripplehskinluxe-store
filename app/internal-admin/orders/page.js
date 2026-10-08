'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, ChannelPill, statusLabel, STATUS, safeSearch } from '@/components/admin/ui';
import { naira, fmtDate } from '@/lib/format.js';
import { toCSV, downloadCSV } from '@/lib/csv.js';

const PAGE = 25;

export default function Orders() {
  const { sb, base, toast } = useAdmin();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ q: '', status: '', channel: '', payment: '', attention: false });
  const [loading, setLoading] = useState(true);

  const query = useCallback((from, to) => {
    let qb = sb.from('orders').select('id,order_number,created_at,customer_name,customer_phone,total_ngn,channel,status,payment_status,payment_method,needs_attention', { count: 'exact' }).order('created_at', { ascending: false });
    const s = safeSearch(f.q);
    if (s) qb = qb.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
    if (f.status) qb = qb.eq('status', f.status);
    if (f.channel) qb = qb.eq('channel', f.channel);
    if (f.payment) qb = qb.eq('payment_status', f.payment);
    if (f.attention) qb = qb.eq('needs_attention', true);
    return qb.range(from, to);
  }, [sb, f]);

  useEffect(() => {
    setLoading(true);
    query((page - 1) * PAGE, page * PAGE - 1).then(({ data, count, error }) => {
      if (error) toast('Could not load orders'); else { setRows(data || []); setTotal(count || 0); }
      setLoading(false);
    });
  }, [query, page, toast]);

  async function exportAll() {
    const out = [];
    for (let from = 0; from < 5000; from += 500) {
      const { data } = await query(from, from + 499);
      if (!data?.length) break; out.push(...data); if (data.length < 500) break;
    }
    downloadCSV(`orders-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(['order', 'date', 'channel', 'customer', 'phone', 'total', 'payment_method', 'payment_status', 'status'], out.map((o) => [o.order_number, o.created_at.slice(0, 10), o.channel, o.customer_name, o.customer_phone, o.total_ngn, o.payment_method, o.payment_status, o.status])));
  }
  const set = (k, v) => { setF({ ...f, [k]: v }); setPage(1); };

  return (
    <>
      <PageHead title="Orders" sub={`${total} order${total === 1 ? '' : 's'}`}><button className="btn ghost s" onClick={exportAll}>Export CSV</button></PageHead>
      <div className="pnl">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <form onSubmit={(e) => { e.preventDefault(); set('q', new FormData(e.currentTarget).get('q')); }} style={{ flex: '1 1 220px' }}><input className="inp" name="q" placeholder="Search order number, name or phone…" defaultValue={f.q} /></form>
          <select className="sel" style={{ maxWidth: 190 }} value={f.channel} onChange={(e) => set('channel', e.target.value)}><option value="">All channels</option><option value="online">Online</option><option value="store">In-store</option></select>
          <select className="sel" style={{ maxWidth: 190 }} value={f.payment} onChange={(e) => set('payment', e.target.value)}><option value="">All payments</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select>
          <select className="sel" style={{ maxWidth: 190 }} value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="tog" style={{ border: 0, padding: 0, gap: 8 }}><input type="checkbox" checked={f.attention} onChange={(e) => set('attention', e.target.checked)} /> Needs attention</label>
        </div>
        <div className="tw"><table className="t"><thead><tr><th>Order</th><th>Channel</th><th>Customer</th><th>Date</th><th>Amount</th><th>Payment</th><th>Status</th></tr></thead><tbody>
          {rows.map((o) => (
            <tr key={o.id} className={o.needs_attention ? 'lowr' : ''}>
              <td><Link className="lnk" href={`${base}/orders/${o.id}`}>{o.order_number}</Link></td><td><ChannelPill c={o.channel} /></td><td>{o.customer_name}</td><td>{fmtDate(o.created_at)}</td><td>{naira(o.total_ngn)}</td>
              <td><Pill text={o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'refunded' ? 'Refunded' : o.payment_status === 'failed' ? 'Failed' : 'Unpaid'} /></td><td><Pill text={statusLabel(o.status)} />{o.status === 'cancelled' && o.payment_status === 'paid' && <> <Pill text="Refund due" /></>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="mut">{loading ? 'Loading…' : 'No orders found.'}</td></tr>}
        </tbody></table></div>
        {total > PAGE && <div className="pager"><button className="btn ghost s" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="cur">Page {page} of {Math.ceil(total / PAGE)}</span><button className="btn ghost s" disabled={page * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button></div>}
      </div>
    </>
  );
}
