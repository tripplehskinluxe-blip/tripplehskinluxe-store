'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { refreshShop } from '@/components/admin/refreshShop';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import { slugify } from '@/lib/rows.js';

const startForm = () => ({ id: null, name: '', slug: '', description: '', sort: '0', image_url: '' });

async function toJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  } finally { URL.revokeObjectURL(url); }
}

function Inner() {
  const { sb, toast, token } = useAdmin();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(startForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('categories').select('id,name,slug,description,sort,image_url').order('sort').order('name');
    if (error) { toast('Could not load categories'); setRows([]); return; }
    setRows(data || []);
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  const startAdd = () => { setF(startForm()); setSlugTouched(false); setErr(''); setShowForm(true); };
  const startEdit = (c) => {
    setF({ id: c.id, name: c.name, slug: c.slug, description: c.description || '', sort: String(c.sort ?? 0), image_url: c.image_url || '' });
    setSlugTouched(true); setErr(''); setShowForm(true);
  };
  const close = () => { setShowForm(false); setErr(''); };

  async function upload(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const blob = await toJpeg(file);
      const name = `site/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('products').upload(name, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      setF((x) => ({ ...x, image_url: sb.storage.from('products').getPublicUrl(name).data.publicUrl }));
    } catch { toast('The photo could not be uploaded'); }
    setUploading(false);
  }

  async function save(e) {
    e.preventDefault(); setErr('');
    const name = f.name.trim();
    const slug = (f.slug.trim() || slugify(name)).toLowerCase();
    const sort = Number(f.sort || 0);
    if (!name || name.length > 60) return setErr('Name is required (up to 60 characters)');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return setErr('Web address: lowercase letters, numbers and hyphens only');
    if (!Number.isInteger(sort) || sort < 0 || sort > 999) return setErr('Order must be a whole number from 0 to 999');
    setBusy(true);
    const payload = { name, slug, description: f.description.trim().slice(0, 300) || null, sort, image_url: f.image_url || null };
    const { error } = f.id ? await sb.from('categories').update(payload).eq('id', f.id) : await sb.from('categories').insert(payload);
    setBusy(false);
    if (error) {
      setErr(error.code === '23505' ? 'That name or web address is already used by another category' : 'Could not save');
      return;
    }
    refreshShop(token); setShowForm(false); toast(f.id ? 'Category saved' : 'Category added'); load();
  }

  async function del(c) {
    if (!confirm(`Delete ${c.name}?`)) return;
    const { error } = await sb.from('categories').delete().eq('id', c.id);
    if (error) { toast(error.code === '23503' ? `${c.name} still has products in it. Move or delete those products first.` : 'Could not delete'); return; }
    refreshShop(token); toast('Deleted'); load();
  }

  return (
    <>
      <PageHead title="Categories"><button className="btn s" onClick={showForm ? close : startAdd}>{showForm ? 'Close' : 'New category'}</button></PageHead>
      {showForm && (
        <form className="pnl" onSubmit={save}>
          <h3>{f.id ? 'Edit category' : 'New category'}</h3>
          <div className="fld"><label className="f" htmlFor="cg_name">Name</label>
            <input id="cg_name" className="inp" maxLength={60} value={f.name}
              onChange={(e) => { const name = e.target.value; setF((x) => ({ ...x, name, slug: slugTouched ? x.slug : slugify(name) })); }} required /></div>
          <div className="fld"><label className="f" htmlFor="cg_slug">Web address</label>
            <input id="cg_slug" className="inp" maxLength={60} value={f.slug} onChange={(e) => { setSlugTouched(true); setF((x) => ({ ...x, slug: e.target.value })); }} /></div>
          <div className="fld"><label className="f" htmlFor="cg_desc">Short description</label>
            <input id="cg_desc" className="inp" maxLength={300} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} /></div>
          <div className="fld"><label className="f" htmlFor="cg_sort">Order on the shop (0 first)</label>
            <input id="cg_sort" className="inp" type="number" min="0" max="999" value={f.sort} onChange={(e) => setF((x) => ({ ...x, sort: e.target.value }))} /></div>
          <div className="fld"><span className="f">Photo</span>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              {f.image_url ? <img src={f.image_url} alt="" height={56} style={{ borderRadius: 10 }} /> : <span className="mut sm">No picture</span>}
              <label className="btn ghost s" style={{ cursor: 'pointer' }}>{uploading ? 'Uploading…' : f.image_url ? 'Change' : 'Upload'}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={upload} style={{ display: 'none' }} /></label>
              {f.image_url && <button type="button" className="lnkb" onClick={() => setF((x) => ({ ...x, image_url: '' }))}>Remove</button>}
            </div>
          </div>
          {err && <span className="err" style={{ margin: '8px 0', display: 'block' }}>{err}</span>}
          <div className="acts"><button className="btn s" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn ghost s" onClick={close}>Cancel</button></div>
        </form>
      )}
      <div className="pnl"><div className="tw"><table className="t"><thead><tr><th /><th>Name</th><th>Web address</th><th>Order</th><th /></tr></thead><tbody>
        {(rows || []).map((c) => (
          <tr key={c.id}>
            <td style={{ width: 56 }}>{c.image_url ? <img src={c.image_url} alt="" height={36} style={{ borderRadius: 8, display: 'block' }} /> : <span className="mut sm">None</span>}</td>
            <td><b>{c.name}</b>{c.description && <div className="mut sm">{c.description}</div>}</td>
            <td>{c.slug}</td>
            <td>{c.sort}</td>
            <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost s" onClick={() => startEdit(c)}>Edit</button> <button className="btn danger s" onClick={() => del(c)}>Delete</button></td>
          </tr>
        ))}
        {rows && !rows.length && <tr><td colSpan={5} className="mut">No categories yet.</td></tr>}
      </tbody></table></div></div>
    </>
  );
}
export default function CategoriesPage() { return <AdminOnly><Inner /></AdminOnly>; }
