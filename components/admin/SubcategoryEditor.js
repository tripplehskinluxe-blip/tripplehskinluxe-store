'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { refreshShop } from '@/components/admin/refreshShop';
import { slugify } from '@/lib/rows.js';

const BAD = /[,()"\\*%<>]/;
const blank = () => ({ id: null, name: '', group: '', sort: '0' });

// Add, rename and remove the subcategories of ONE category (an admin-only screen, and the database enforces that too).
export default function SubcategoryEditor({ categoryId, categoryName }) {
  const { sb, toast, token } = useAdmin();
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({});
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      sb.from('subcategories').select('id,name,group_name,sort').eq('category_id', categoryId).order('sort').order('name'),
      sb.from('products').select('subcategory').eq('category_id', categoryId).not('subcategory', 'is', null).range(0, 4999),
    ]);
    if (s.error) { toast('Could not load subcategories'); setRows([]); return; }
    setRows(s.data || []);
    const c = {}; (p.data || []).forEach((r) => { c[r.subcategory] = (c[r.subcategory] || 0) + 1; }); setCounts(c);
  }, [sb, categoryId, toast]);
  useEffect(() => { setF(blank()); setErr(''); setRows(null); load(); }, [load]);

  async function save(e) {
    e.preventDefault(); setErr('');
    const name = f.name.trim(), group = f.group.trim(), sort = Number(f.sort || 0);
    if (!name || name.length > 60) return setErr('Name is required (up to 60 characters)');
    if (group.length > 40) return setErr('Group heading: up to 40 characters');
    if (BAD.test(name) || BAD.test(group)) return setErr('Names cannot contain commas, brackets, quotes, * or %');
    if (!Number.isInteger(sort) || sort < 0 || sort > 999) return setErr('Order must be a whole number from 0 to 999');
    const slug = slugify(name);
    if (!slug) return setErr('Use some letters or numbers in the name');
    setBusy(true);
    const payload = { name, group_name: group || null, slug, sort };
    const { error } = f.id ? await sb.from('subcategories').update(payload).eq('id', f.id) : await sb.from('subcategories').insert({ ...payload, category_id: categoryId });
    setBusy(false);
    if (error) { setErr(error.code === '23505' ? 'This category already has a subcategory with that name' : 'Could not save'); return; }
    refreshShop(token); setF(blank()); toast(f.id ? 'Subcategory saved' : 'Subcategory added'); load();
  }

  async function remove(r) {
    const n = counts[r.name] || 0;
    const msg = n
      ? `Remove “${r.name}”? The ${n} product${n === 1 ? '' : 's'} in it will stay in ${categoryName || 'this category'} but will no longer have a subcategory.`
      : `Remove “${r.name}”?`;
    if (!confirm(msg)) return;
    const { error } = await sb.from('subcategories').delete().eq('id', r.id);
    if (error) { toast('Could not remove'); return; }
    refreshShop(token); if (f.id === r.id) setF(blank()); toast('Subcategory removed'); load();
  }

  const groups = [...new Set((rows || []).map((r) => r.group_name).filter(Boolean))];
  return (
    <div className="pnl">
      <h3>Subcategories in {categoryName}</h3>
      <p className="mut sm" style={{ marginBottom: 14 }}>Shoppers can browse and search by these. A group heading (for example “Face” or “Body Care”) is optional and keeps related subcategories together.</p>
      <div className="tw"><table className="t"><thead><tr><th>Name</th><th>Group heading</th><th>Order</th><th>Products</th><th /></tr></thead><tbody>
        {(rows || []).map((r) => (
          <tr key={r.id}>
            <td><b>{r.name}</b></td>
            <td>{r.group_name || <span className="mut">None</span>}</td>
            <td>{r.sort}</td>
            <td>{counts[r.name] || 0}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button type="button" className="btn ghost s" onClick={() => { setErr(''); setF({ id: r.id, name: r.name, group: r.group_name || '', sort: String(r.sort ?? 0) }); }}>Edit</button>{' '}
              <button type="button" className="btn danger s" onClick={() => remove(r)}>Remove</button>
            </td>
          </tr>
        ))}
        {rows && !rows.length && <tr><td colSpan={5} className="mut">No subcategories yet.</td></tr>}
        {!rows && <tr><td colSpan={5} className="mut">Loading…</td></tr>}
      </tbody></table></div>
      <form onSubmit={save} style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{f.id ? 'Edit subcategory' : 'Add a subcategory'}</h3>
        <div className="row2">
          <div className="fld"><label className="f" htmlFor="sc_name">Name</label>
            <input id="sc_name" className="inp" maxLength={60} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} required /></div>
          <div className="fld"><label className="f" htmlFor="sc_group">Group heading (optional)</label>
            <input id="sc_group" className="inp" maxLength={40} list="sc_groups" value={f.group} onChange={(e) => setF((x) => ({ ...x, group: e.target.value }))} />
            <datalist id="sc_groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></div>
        </div>
        <div className="fld" style={{ maxWidth: 220 }}><label className="f" htmlFor="sc_sort">Order (0 first)</label>
          <input id="sc_sort" className="inp" type="number" min="0" max="999" value={f.sort} onChange={(e) => setF((x) => ({ ...x, sort: e.target.value }))} /></div>
        {err && <span className="err" style={{ margin: '8px 0', display: 'block' }}>{err}</span>}
        <div className="acts"><button className="btn s" disabled={busy}>{busy ? 'Saving…' : f.id ? 'Save subcategory' : 'Add subcategory'}</button>
          {f.id && <button type="button" className="btn ghost s" onClick={() => { setF(blank()); setErr(''); }}>Cancel</button>}</div>
      </form>
    </div>
  );
}
