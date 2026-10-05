'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, Modal, statusLabel } from '@/components/admin/ui';
import { naira, fmtDate } from '@/lib/format.js';
import { toCSV, downloadCSV } from '@/lib/csv.js';

export default function Customers() {
  const { sb, base, toast } = useAdmin();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);

  useEffect(() => {
    (async () => {
      const [c, o] = await Promise.all([
        sb.from('customers').select('id,name,email,phone,created_at').order('created_at', { ascending: false }).limit(2000),
        sb.from('orders').select('id,order_number,customer_id,total_ngn,status,payment_status,created_at').not('customer_id', 'is', null).order('created_at', { ascending: false }).limit(5000),
      ]);
      if (c.error || o.error) { toast('Could not load customers'); setRows([]); return; }
      const agg = {};
      o.data.forEach((x) => { const a = (agg[x.customer_id] ||= { orders: [], spent: 0 }); a.orders.push(x); if (x.payment_status === 'paid' && x.status !== 'cancelled') a.spent += x.total_ngn; });
      setRows(c.data.map((x) => ({ ...x, orders: agg[x.id]?.orders || [], spent: agg[x.id]?.spent || 0, last: agg[x.id]?.orders[0]?.created_at || null })).sort((a, b) => b.spent - a.spent));
    })();
  }, [sb, toast]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((c) => !s || [c.name, c.email, c.phone].join(' ').toLowerCase().includes(s));
  }, [rows, q]);

  const exportCsv = () => downloadCSV(`customers-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(['name', 'email', 'phone', 'orders', 'total_spent', 'last_order'], shown.map((c) => [c.name, c.email, c.phone, c.orders.length, c.spent, c.last ? c.last.slice(0, 10) : ''])));

  return (
    <>
      <PageHead title="Customers" sub={rows ? `${rows.length} customer${rows.length === 1 ? '' : 's'}` : ''}><button className="btn ghost s" onClick={exportCsv}>Export CSV</button></PageHead>
      <div className="pnl">
        <input className="inp" style={{ marginBottom: 14, maxWidth: 360 }} placeholder="Search name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        <div className="tw"><table className="t"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead><tbody>
          {shown.slice(0, 200).map((c) => (
            <tr key={c.id} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
              <td><b>{c.name || '—'}</b></td><td>{c.email || '—'}</td><td>{c.phone || '—'}</td><td>{c.orders.length}</td><td>{naira(c.spent)}</td><td>{c.last ? fmtDate(c.last) : '—'}</td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6} className="mut">{rows ? 'No customers found.' : 'Loading…'}</td></tr>}
        </tbody></table></div>
        {shown.length > 200 && <p className="sm mut" style={{ marginTop: 12 }}>Showing the top 200. Search to narrow down, or export the full list.</p>}
      </div>
      {sel && (
        <Modal onClose={() => setSel(null)}>
          <h3>{sel.name || 'Customer'}</h3>
          <dl className="kv" style={{ marginBottom: 18 }}><dt>Email</dt><dd>{sel.email || '—'}</dd><dt>Phone</dt><dd>{sel.phone || '—'}</dd><dt>Orders</dt><dd>{sel.orders.length}</dd><dt>Total spent</dt><dd><b>{naira(sel.spent)}</b></dd></dl>
          {sel.orders.slice(0, 15).map((o) => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}><Link className="lnk" href={`${base}/orders/${o.id}`}>{o.order_number}</Link><span className="mut">{fmtDate(o.created_at)}</span><span>{naira(o.total_ngn)}</span><Pill text={statusLabel(o.status)} /></div>)}
          {!sel.orders.length && <p className="mut">No orders yet.</p>}
          <button className="btn ghost block" style={{ marginTop: 16 }} onClick={() => setSel(null)}>Close</button>
        </Modal>
      )}
    </>
  );
}
