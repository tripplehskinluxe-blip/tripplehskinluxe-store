'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, AdminOnly } from '@/components/admin/ui';
import { fmtDate } from '@/lib/format.js';

function Inner() {
  const { sb, token, toast } = useAdmin();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('published');

  const load = useCallback(async () => {
    let qb = sb.from('reviews').select('id,name,rating,body,status,created_at,removed_at,products(name)').order('created_at', { ascending: false }).limit(100);
    if (status) qb = qb.eq('status', status);
    const { data, error } = await qb;
    if (error) { toast('Could not load reviews'); setRows([]); } else setRows(data || []);
  }, [sb, status, toast]);
  useEffect(() => { load(); }, [load]);

  async function setS(r, v) {
    try {
      const res = await fetch('/api/admin/reviews/set-status', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ review_id: r.id, status: v }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || 'Could not update the review'); return; }
      toast(v === 'hidden' ? 'Review removed' : 'Review restored'); load();
    } catch { toast('Could not reach the server'); }
  }

  return (
    <>
      <PageHead title="Reviews" sub="Reviews post straight away, from buyers whose order has been delivered. Any staff member can remove one; removing just hides it, it is never deleted." />
      <div className="pnl">
        <select className="sel" style={{ maxWidth: 200, marginBottom: 14 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter reviews">
          <option value="published">Published</option><option value="hidden">Removed</option><option value="">All</option>
        </select>
        <div className="tw"><table className="t"><thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Status</th><th /></tr></thead><tbody>
          {(rows || []).map((r) => (
            <tr key={r.id}>
              <td>{r.products?.name || 'Removed product'}</td>
              <td>{r.name}<br /><span className="mut sm">{fmtDate(r.created_at)}</span></td>
              <td style={{ color: 'var(--p)', whiteSpace: 'nowrap' }}>{'★'.repeat(r.rating)}</td>
              <td style={{ maxWidth: 360 }}>{r.body || <span className="mut">No written review</span>}</td>
              <td><Pill text={r.status === 'published' ? 'Published' : 'Removed'} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {r.status === 'published' && <button className="btn ghost s" onClick={() => setS(r, 'hidden')}>Remove</button>}
                {r.status === 'hidden' && <button className="btn ghost s" onClick={() => setS(r, 'published')}>Restore</button>}
              </td>
            </tr>
          ))}
          {!rows?.length && <tr><td colSpan={6} className="mut">{rows ? 'No reviews here.' : 'Loading…'}</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
export default function Reviews() { return <AdminOnly><Inner /></AdminOnly>; }
