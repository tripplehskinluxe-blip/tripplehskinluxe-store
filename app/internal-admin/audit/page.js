'use client';
// Audit log: read-only, admin only. The database itself also allows only admins to read it (row-level security).
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import { fmtDate } from '@/lib/format.js';

const PAGE = 50;
const clean = (s) => String(s || '').replace(/[%_,()*"\\]/g, '').trim().slice(0, 60);
const short = (id) => (id ? String(id).slice(0, 8) : 'system');

function Inner() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [names, setNames] = useState({});
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    let q = sb.from('audit_log').select('id,actor,action,entity,entity_id,meta,created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (clean(action)) q = q.ilike('action', `%${clean(action)}%`);
    if (clean(entity)) q = q.ilike('entity', `%${clean(entity)}%`);
    if (from) q = q.gte('created_at', new Date(`${from}T00:00:00`).toISOString());
    if (to) q = q.lte('created_at', new Date(`${to}T23:59:59.999`).toISOString());
    const { data, error, count } = await q;
    if (error) { toast('Could not load the audit log'); setRows([]); return; }
    setRows(data || []); setTotal(count || 0);
    const ids = [...new Set((data || []).map((r) => r.actor).filter(Boolean))];
    if (ids.length) {
      const { data: p } = await sb.from('profiles').select('id,full_name').in('id', ids);
      const map = {}; (p || []).forEach((x) => { map[x.id] = x.full_name; }); setNames(map);
    }
  }, [sb, page, action, entity, from, to, toast]);
  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const who = (id) => (id ? (names[id] || `Staff ${short(id)}`) : 'System');
  const inp = { padding: '10px 12px', border: '1.5px solid #e1d6ee', borderRadius: 10, fontSize: 14 };

  return (
    <>
      <PageHead title="Audit log" sub="Every sensitive action in the shop is recorded here. Entries cannot be edited or deleted." />
      <div className="pnl">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input style={inp} placeholder="Action (e.g. refund)" value={action} onChange={(e) => { setPage(0); setAction(e.target.value); }} aria-label="Filter by action" />
          <input style={inp} placeholder="Item (e.g. order)" value={entity} onChange={(e) => { setPage(0); setEntity(e.target.value); }} aria-label="Filter by item" />
          <input style={inp} type="date" value={from} onChange={(e) => { setPage(0); setFrom(e.target.value); }} aria-label="From date" />
          <input style={inp} type="date" value={to} onChange={(e) => { setPage(0); setTo(e.target.value); }} aria-label="To date" />
        </div>
        <div className="tw"><table className="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th></tr></thead><tbody>
          {(rows || []).map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
              <td>{who(r.actor)}</td>
              <td><b>{r.action}</b></td>
              <td>{r.entity ? `${r.entity} ${short(r.entity_id)}` : '—'}</td>
              <td style={{ maxWidth: 360, fontSize: 12, color: '#6f6581', wordBreak: 'break-word' }}>{r.meta ? JSON.stringify(r.meta).slice(0, 160) : '—'}</td>
            </tr>
          ))}
          {rows && !rows.length && <tr><td colSpan={5} className="mut">No entries match these filters.</td></tr>}
          {!rows && <tr><td colSpan={5} className="mut">Loading…</td></tr>}
        </tbody></table></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <button className="btn ghost s" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Newer</button>
          <span className="sm mut">Page {page + 1} of {pages} · {total} entries</span>
          <button className="btn ghost s" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Older</button>
        </div>
      </div>
    </>
  );
}
export default function Audit() { return <AdminOnly><Inner /></AdminOnly>; }
