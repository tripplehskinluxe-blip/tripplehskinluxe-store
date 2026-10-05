'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, AdminOnly } from '@/components/admin/ui';
import { fmtDate } from '@/lib/format.js';

function Inner() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('pending');

  const load = useCallback(async () => {
    let qb = sb.from('reviews').select('id,name,rating,body,status,created_at,products(name)').order('created_at', { ascending: false }).limit(100);
    if (status) qb = qb.eq('status', status);
    const { data, error } = await qb;
    if (error) { toast('Could not load reviews'); setRows([]); } else setRows(data || []);
  }, [sb, status, toast]);
  useEffect(() => { load(); }, [load]);

  const setS = async (r, v) => { const { error } = await sb.from('reviews').update({ status: v }).eq('id', r.id); if (error) toast('Could not update'); else { toast('Review updated'); load(); } };
  const del = async (r) => { if (!confirm('Delete this review permanently?')) return; const { error } = await sb.from('reviews').delete().eq('id', r.id); if (error) toast('Could not delete'); else load(); };

  return (
    <>
      <PageHead title="Reviews" sub="Only published reviews appear on the shop. Product ratings update automatically." />
      <div className="pnl">
        <select className="sel" style={{ maxWidth: 200, marginBottom: 14 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter reviews"><option value="pending">Waiting for approval</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="">All</option></select>
        <div className="tw"><table className="t"><thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Status</th><th /></tr></thead><tbody>
          {(rows || []).map((r) => (
            <tr key={r.id}>
              <td>{r.products?.name || '—'}</td><td>{r.name}<br /><span className="mut sm">{fmtDate(r.created_at)}</span></td><td style={{ color: 'var(--p)', whiteSpace: 'nowrap' }}>{'★'.repeat(r.rating)}</td><td style={{ maxWidth: 320 }}>{r.body}</td>
              <td><Pill text={r.status === 'published' ? 'Published' : r.status === 'hidden' ? 'Hidden' : 'Pending'} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.status !== 'published' && <button className="btn ghost s" onClick={() => setS(r, 'published')}>Publish</button>} {r.status === 'published' && <button className="btn ghost s" onClick={() => setS(r, 'hidden')}>Hide</button>} <button className="btn danger s" onClick={() => del(r)}>Delete</button></td>
            </tr>
          ))}
          {!rows?.length && <tr><td colSpan={6} className="mut">{rows ? 'No reviews here.' : 'Loading…'}</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
export default function Reviews() { return <AdminOnly><Inner /></AdminOnly>; }
