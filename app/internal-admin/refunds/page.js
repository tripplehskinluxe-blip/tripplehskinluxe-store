'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, RefundsAccess } from '@/components/admin/ui';
import { naira, fmtDate } from '@/lib/format.js';

function Inner() {
  const { sb, toast, token, base } = useAdmin();
  const [rows, setRows] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const sel = 'order_id,amount_ngn,status,requested_by,created_at,decided_at,decision_note,orders(order_number,customer_name,status,cancelled_by)';
    const [a, b] = await Promise.all([
      sb.from('order_refunds').select(sel).eq('status', 'awaiting_approval').order('created_at'),
      sb.from('order_refunds').select(sel).neq('status', 'awaiting_approval').not('decided_at', 'is', null).order('decided_at', { ascending: false }).limit(10),
    ]);
    if (a.error) { toast('Could not load refunds'); setRows([]); return; }
    setRows(a.data || []); setRecent(b.data || []);
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  async function act(kind, r) {
    let note = '';
    if (kind === 'approve') { if (!confirm(`Approve the refund of ${naira(r.amount_ngn)} for ${r.orders?.order_number}? It is sent back through Paystack to the customer's original payment method.`)) return; }
    else { note = window.prompt('Reason for declining (optional, kept on record):', ''); if (note === null) return; }
    setBusy(r.order_id);
    try {
      const res = await fetch(`/api/admin/refunds/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: r.order_id, note }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast(d.error || 'That did not work');
      else if (kind === 'approve') toast(d.refund === 'issued' ? 'Approved · refund sent · customer emailed' : 'Approved, but Paystack did not accept it yet. Open the order to retry.');
      else toast(d.reinstated ? 'Declined · the order is back where it was' : 'Declined');
    } catch { toast('Could not reach the server'); }
    setBusy(''); load();
  }

  return (
    <>
      <PageHead title="Refunds" sub="Refunds for cancelled, paid orders wait here. No money is sent until one of you approves it." />
      <div className="pnl">
        <div className="tw"><table className="t"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Cancelled by</th><th>Waiting since</th><th /></tr></thead><tbody>
          {(rows || []).map((r) => (
            <tr key={r.order_id}>
              <td><Link href={`${base}/orders/${r.order_id}`}><b>{r.orders?.order_number}</b></Link></td>
              <td>{r.orders?.customer_name}</td>
              <td>{naira(r.amount_ngn)}</td>
              <td>{r.requested_by === 'customer' ? <Pill text="Customer" /> : <Pill text="Staff" />}</td>
              <td>{fmtDate(r.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn s" disabled={busy === r.order_id} onClick={() => act('approve', r)}>Approve</button>{' '}
                <button className="btn ghost s" disabled={busy === r.order_id} onClick={() => act('decline', r)}>Decline</button>
              </td>
            </tr>
          ))}
          {rows && !rows.length && <tr><td colSpan={6} className="mut">Nothing is waiting for approval.</td></tr>}
          {!rows && <tr><td colSpan={6} className="mut">Loading…</td></tr>}
        </tbody></table></div>
        <p className="sm mut" style={{ marginTop: 14 }}>For a customer&apos;s cancellation, check that the goods have not been dispatched or delivered before approving. If they have, decline: the order goes back to where it was.</p>
      </div>
      {recent.length > 0 && (
        <div className="pnl"><h3>Recent decisions</h3>
          <div className="tw"><table className="t"><thead><tr><th>Order</th><th>Amount</th><th>Result</th><th>When</th></tr></thead><tbody>
            {recent.map((r) => <tr key={r.order_id}><td><Link href={`${base}/orders/${r.order_id}`}>{r.orders?.order_number}</Link></td><td>{naira(r.amount_ngn)}</td><td>{r.status === 'declined' ? 'Declined' : 'Approved'}</td><td>{fmtDate(r.decided_at)}</td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </>
  );
}
export default function Refunds() { return <RefundsAccess><Inner /></RefundsAccess>; }
