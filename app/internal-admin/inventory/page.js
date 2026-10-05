'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, Modal, safeSearch } from '@/components/admin/ui';
import { fmtDate } from '@/lib/format.js';

const PAGE = 30;
const REASON = { order: 'Online order', pos: 'In-store sale', import: 'CSV import', adjustment: 'Manual change', cancel: 'Order cancelled' };
const stockText = (n) => (n <= 0 ? 'Out of stock' : n < 5 ? 'Low stock' : 'In stock');

export default function Inventory() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [vals, setVals] = useState({});
  const [hist, setHist] = useState(null);

  const load = useCallback(async () => {
    let qb = sb.from('products').select('id,name,sku,stock', { count: 'exact' }).eq('is_active', true).order('stock').order('name');
    const s = safeSearch(q);
    if (s) qb = qb.or(`name.ilike.%${s}%,sku.ilike.%${s}%`);
    if (lowOnly) qb = qb.lt('stock', 5);
    const { data, count, error } = await qb.range((page - 1) * PAGE, page * PAGE - 1);
    if (error) toast('Could not load inventory'); else { setRows(data || []); setTotal(count || 0); setVals({}); }
  }, [sb, q, page, lowOnly, toast]);
  useEffect(() => { load(); }, [load]);

  async function save(p) {
    const n = Number(vals[p.id]);
    if (!Number.isInteger(n) || n < 0) return toast('Enter a whole number, 0 or more');
    const { error } = await sb.rpc('set_stock_count', { p_product: p.id, p_count: n, p_note: 'Manual count' });
    if (error) toast('Could not update stock'); else { toast('Stock updated'); load(); }
  }
  async function history(p) {
    const { data } = await sb.from('stock_movements').select('id,delta,reason,note,created_at').eq('product_id', p.id).order('created_at', { ascending: false }).limit(25);
    setHist({ p, rows: data || [] });
  }

  return (
    <>
      <PageHead title="Inventory" sub={`${total} product${total === 1 ? '' : 's'}${lowOnly ? ' running low' : ''}. Online and in-store sales share this stock.`} />
      <div className="pnl">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <form style={{ flex: '1 1 220px' }} onSubmit={(e) => { e.preventDefault(); setQ(new FormData(e.currentTarget).get('q')); setPage(1); }}><input className="inp" name="q" placeholder="Search name or SKU…" defaultValue={q} /></form>
          <label className="tog" style={{ border: 0, padding: 0, gap: 8 }}><input type="checkbox" checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); setPage(1); }} /> Low or out of stock only</label>
        </div>
        <div className="tw"><table className="t"><thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Set new count</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((p) => (
            <tr key={p.id} className={p.stock < 5 ? 'lowr' : ''}>
              <td><b>{p.name}</b></td><td>{p.sku}</td><td>{p.stock}</td>
              <td style={{ whiteSpace: 'nowrap' }}><input className="inp" type="number" min="0" style={{ width: 90, padding: '8px 10px' }} aria-label={`New stock for ${p.name}`} value={vals[p.id] ?? ''} placeholder={String(p.stock)} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} /> <button className="btn ghost s" onClick={() => save(p)} disabled={vals[p.id] === undefined || vals[p.id] === ''}>Save</button></td>
              <td><Pill text={stockText(p.stock)} /></td><td><button className="lnk sm" onClick={() => history(p)}>History</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="mut">No products found.</td></tr>}
        </tbody></table></div>
        {total > PAGE && <div className="pager"><button className="btn ghost s" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="cur">Page {page} of {Math.ceil(total / PAGE)}</span><button className="btn ghost s" disabled={page * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button></div>}
      </div>
      {hist && (
        <Modal onClose={() => setHist(null)}>
          <h3>Stock history</h3><p className="mut" style={{ marginBottom: 14 }}>{hist.p.name}</p>
          {hist.rows.map((m) => <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}><span>{REASON[m.reason] || m.reason}{m.note ? <span className="mut"> · {m.note}</span> : null}<br /><span className="mut sm">{fmtDate(m.created_at)}</span></span><b style={{ color: m.delta < 0 ? 'var(--err)' : 'var(--ok)' }}>{m.delta > 0 ? '+' : ''}{m.delta}</b></div>)}
          {!hist.rows.length && <p className="mut">No changes recorded yet.</p>}
          <button className="btn ghost block" style={{ marginTop: 16 }} onClick={() => setHist(null)}>Close</button>
        </Modal>
      )}
    </>
  );
}
