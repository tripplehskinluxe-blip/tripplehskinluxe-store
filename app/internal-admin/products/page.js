'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, Modal, AdminOnly, safeSearch } from '@/components/admin/ui';
import { PRODUCT_COLUMNS, toCSV, downloadCSV, productToRow } from '@/lib/csv.js';
import { slugify } from '@/lib/rows.js';
import { naira } from '@/lib/format.js';

const PAGE = 25;
const CONCERNS = { acne: 'Acne & Breakouts', dry: 'Dry Skin', darkspots: 'Dark Spots', pigment: 'Hyperpigmentation', sensitive: 'Sensitive Skin', glow: 'Glow & Radiance' };
const COLS = 'id,sku,name,brand,category_id,subcategory,price_ngn,old_price_ngn,stock,images,is_active,is_featured,is_best_seller,is_new,short_description,description,ingredients,how_to_use,tags,concerns,created_at,categories(name)';
const stockText = (p) => (p.stock <= 0 ? 'Out of stock' : p.stock < 5 ? 'Low stock' : 'In stock');

async function toJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

function ProductForm({ p, cats, onClose, onSaved }) {
  const { sb, toast } = useAdmin();
  const [f, setF] = useState({
    name: p?.name || '', brand: p?.brand || '', category_id: p?.category_id || cats[0]?.id || '', price: p?.price_ngn ?? '', old: p?.old_price_ngn ?? '', stock: '',
    sku: p?.sku || '', short: p?.short_description || '', desc: p?.description || '', ing: p?.ingredients || '', how: p?.how_to_use || '',
    tags: (p?.tags || []).join(', '), concerns: p?.concerns || [], images: p?.images || [], feat: !!p?.is_featured, best: !!p?.is_best_seller, isnew: !!p?.is_new,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setF((s) => ({ ...s, [k]: v })); };
  const toggleConcern = (k) => setF((s) => ({ ...s, concerns: s.concerns.includes(k) ? s.concerns.filter((x) => x !== k) : [...s.concerns, k] }));

  async function upload(e) {
    const files = [...e.target.files].slice(0, 6); e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const urls = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const blob = await toJpeg(file);
        const path = `${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from('products').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        urls.push(sb.storage.from('products').getPublicUrl(path).data.publicUrl);
      } catch { toast('An image could not be uploaded'); }
    }
    setF((s) => ({ ...s, images: [...s.images, ...urls] }));
    setBusy(false);
  }

  async function save() {
    setErr('');
    const price = Number(f.price), old = f.old === '' ? null : Number(f.old), stock = f.stock === '' ? 0 : Number(f.stock);
    if (f.name.trim().length < 2) return setErr('Enter the product name');
    if (!Number.isInteger(price) || price < 0) return setErr('Price must be a whole number of naira');
    if (old !== null && (!Number.isInteger(old) || old <= price)) return setErr('Old price must be higher than the price (or leave it empty)');
    if (!p && (!Number.isInteger(stock) || stock < 0)) return setErr('Opening stock must be 0 or more');
    setBusy(true);
    const row = {
      name: f.name.trim(), brand: f.brand.trim() || 'Tripple H Skin Luxe', category_id: f.category_id || null, price_ngn: price, old_price_ngn: old,
      sku: f.sku.trim() || `THS-${String(Date.now()).slice(-6)}`, short_description: f.short.trim() || null, description: f.desc.trim() || null,
      ingredients: f.ing.trim() || null, how_to_use: f.how.trim() || null, tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
      concerns: f.concerns, images: f.images.filter((u) => /^https:\/\//.test(u)), is_featured: f.feat, is_best_seller: f.best, is_new: f.isnew,
    };
    let error;
    if (p) ({ error } = await sb.from('products').update(row).eq('id', p.id));
    else {
      let slug = slugify(row.name), res;
      for (let i = 0; i < 3; i++) {
        res = await sb.from('products').insert({ ...row, slug, stock: 0, is_active: true }).select('id').single();
        if (res.error?.code === '23505' && /slug/.test(res.error.message)) { slug = `${slugify(row.name)}-${Math.random().toString(36).slice(2, 6)}`; continue; }
        break;
      }
      error = res.error;
      if (!error && stock > 0) await sb.rpc('adjust_stock', { p_product: res.data.id, p_delta: stock, p_note: 'Opening stock' });
    }
    setBusy(false);
    if (error) return setErr(/sku/.test(error.message) ? 'That SKU is already used by another product' : 'Could not save. Admin access with two-factor is required.');
    toast('Product saved'); onSaved();
  }

  const inp = (k, label, props = {}) => <div className="fld"><label className="f" htmlFor={`pf_${k}`}>{label}</label><input id={`pf_${k}`} className="inp" value={f[k]} onChange={set(k)} {...props} /></div>;
  const area = (k, label, rows = 3) => <div className="fld"><label className="f" htmlFor={`pf_${k}`}>{label}</label><textarea id={`pf_${k}`} className="inp" rows={rows} value={f[k]} onChange={set(k)} /></div>;
  return (
    <Modal onClose={onClose}>
      <h3>{p ? 'Edit product' : 'Add product'}</h3>
      <div className="row2">{inp('name', 'Product name', { maxLength: 140 })}{inp('brand', 'Brand', { maxLength: 80 })}</div>
      <div className="row2">
        <div className="fld"><label className="f" htmlFor="pf_cat">Category</label><select id="pf_cat" className="sel" value={f.category_id} onChange={set('category_id')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {inp('sku', 'SKU (optional)', { maxLength: 40 })}
      </div>
      <div className="row2">{inp('price', 'Price (₦)', { type: 'number', min: 0 })}{inp('old', 'Old price (₦, optional)', { type: 'number', min: 0 })}</div>
      {p ? <p className="sm mut" style={{ marginBottom: 16 }}>Current stock: <b>{p.stock}</b>. Change it in Inventory so every change is logged.</p> : inp('stock', 'Opening stock', { type: 'number', min: 0 })}
      {inp('short', 'Short description', { maxLength: 200 })}{area('desc', 'Description', 4)}{area('ing', 'Ingredients', 2)}{area('how', 'How to use', 2)}
      {inp('tags', 'Tags (comma separated)')}
      <div className="fld"><label className="f">Skin concerns</label><div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{Object.entries(CONCERNS).map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 6, fontSize: 14 }}><input type="checkbox" checked={f.concerns.includes(k)} onChange={() => toggleConcern(k)} />{l}</label>)}</div></div>
      <div className="fld"><label className="f">Photos</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>{f.images.map((u) => <div key={u} style={{ position: 'relative' }}><img src={u} alt="" width={64} height={64} style={{ objectFit: 'cover', borderRadius: 10 }} /><button type="button" aria-label="Remove photo" onClick={() => setF((s) => ({ ...s, images: s.images.filter((x) => x !== u) }))} style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid var(--line)', borderRadius: 999, width: 22, height: 22 }}>×</button></div>)}</div>
        <input className="inp" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} disabled={busy} />
        <p className="sm mut" style={{ marginTop: 6 }}>JPEG, PNG or WebP. Photos are resized automatically. With no photo, an illustrated placeholder is shown.</p></div>
      <label className="tog"><span>Featured</span><input type="checkbox" checked={f.feat} onChange={set('feat')} /></label>
      <label className="tog"><span>Best seller</span><input type="checkbox" checked={f.best} onChange={set('best')} /></label>
      <label className="tog"><span>New arrival</span><input type="checkbox" checked={f.isnew} onChange={set('isnew')} /></label>
      {err && <span className="err" style={{ marginTop: 12 }}>{err}</span>}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div>
    </Modal>
  );
}

function ImportModal({ preview, text, onClose, onDone }) {
  const { token, toast } = useAdmin();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await fetch('/api/admin/import', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'text/csv' }, body: text });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(d.error || 'Import failed');
    toast(`Imported: ${d.created} new, ${d.updated} updated`); onDone();
  }
  return (
    <Modal onClose={onClose}>
      <h3>Import preview</h3>
      <p><b>{preview.created}</b> new products, <b>{preview.updated}</b> to update{preview.skipped ? <>, <b style={{ color: 'var(--err)' }}>{preview.skipped}</b> skipped</> : ''}.</p>
      {preview.errors?.length > 0 && <div className="alert" style={{ display: 'block', marginTop: 14 }}>{preview.errors.slice(0, 8).map((e, i) => <div key={i}>Row {e.row}: {e.error}</div>)}{preview.errors.length > 8 && <div>…and more</div>}</div>}
      {preview.warnings?.length > 0 && <div className="alert" style={{ display: 'block', marginTop: 14 }}><b>Photos removed ({preview.warnings.length}):</b> only photos uploaded here (or from Cloudinary) can be shown. Upload them with Edit product instead.{preview.warnings.slice(0, 5).map((e, i) => <div key={i} className="sm">Row {e.row}: {e.error}</div>)}</div>}
      <p className="sm mut" style={{ marginTop: 14 }}>Products are matched by SKU, so importing again updates instead of duplicating. Stock changes are logged.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={go} disabled={busy || (!preview.created && !preview.updated)}>{busy ? 'Importing…' : 'Import now'}</button></div>
    </Modal>
  );
}

function ProductsInner() {
  const { sb, token, toast } = useAdmin();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [cats, setCats] = useState([]);
  const [edit, setEdit] = useState(null);       // null | 'new' | product
  const [imp, setImp] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let qb = sb.from('products').select(COLS, { count: 'exact' }).eq('is_active', !archived).order('created_at', { ascending: false });
    const s = safeSearch(q);
    if (s) qb = qb.or(`name.ilike.%${s}%,brand.ilike.%${s}%,sku.ilike.%${s}%`);
    const { data, count, error } = await qb.range((page - 1) * PAGE, page * PAGE - 1);
    if (error) toast('Could not load products'); else { setRows(data || []); setTotal(count || 0); }
    setLoading(false);
  }, [sb, q, page, archived, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { sb.from('categories').select('id,name').order('name').then(({ data }) => setCats(data || [])); }, [sb]);

  async function setActive(p, v) {
    const { error } = await sb.from('products').update({ is_active: v }).eq('id', p.id);
    if (error) toast('Could not update'); else { toast(v ? 'Product restored' : 'Product archived'); load(); }
  }
  async function exportAll() {
    const out = [];
    for (let from = 0; from < 10000; from += 1000) {
      const { data } = await sb.from('products').select(COLS).eq('is_active', true).order('sku').range(from, from + 999);
      if (!data?.length) break; out.push(...data); if (data.length < 1000) break;
    }
    downloadCSV(`products-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(PRODUCT_COLUMNS, out.map(productToRow)));
  }
  function template() {
    downloadCSV('product-import-template.csv', toCSV(PRODUCT_COLUMNS, [['TH-1001', 'Example Serum', 'GlowLab', 'Skincare', 'Serums', 15000, 18000, 25, 'One-line summary', 'Longer description', 'Aqua, Glycerin', 'Apply twice daily', 'serum|brightening', 'darkspots|glow', 'https://example.com/photo1.jpg', 0, 1, 1]]));
  }
  async function pickFile(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) return toast('That file is larger than 5 MB');
    const text = await file.text();
    const r = await fetch('/api/admin/import?dry=1', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'text/csv' }, body: text });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast(d.error || 'Could not read that file');
    setImp({ preview: d, text });
  }

  return (
    <>
      <PageHead title="Products" sub={`${total} ${archived ? 'archived' : 'active'} product${total === 1 ? '' : 's'}`}>
        <button className="btn ghost s" onClick={template}>CSV template</button>
        <button className="btn ghost s" onClick={exportAll}>Export CSV</button>
        <label className="btn ghost s" style={{ cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={pickFile} /></label>
        <button className="btn s" onClick={() => setEdit('new')}>Add product</button>
      </PageHead>
      <div className="pnl">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <form style={{ flex: '1 1 220px' }} onSubmit={(e) => { e.preventDefault(); setQ(new FormData(e.currentTarget).get('q')); setPage(1); }}><input className="inp" name="q" placeholder="Search name, brand or SKU…" defaultValue={q} /></form>
          <select className="sel" style={{ maxWidth: 170 }} value={archived ? 'a' : 'x'} onChange={(e) => { setArchived(e.target.value === 'a'); setPage(1); }}><option value="x">Active</option><option value="a">Archived</option></select>
        </div>
        <div className="tw"><table className="t"><thead><tr><th>Photo</th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><div className="th">{p.images?.[0] ? <img src={p.images[0]} alt="" /> : null}</div></td>
              <td><b>{p.name}</b><br /><span className="mut sm">{p.brand} · {p.sku}</span></td><td>{p.categories?.name}</td>
              <td>{naira(p.price_ngn)}{p.old_price_ngn ? <><br /><s className="mut sm">{naira(p.old_price_ngn)}</s></> : null}</td><td>{p.stock}</td><td><Pill text={stockText(p)} /></td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost s" onClick={() => setEdit(p)}>Edit</button> {archived ? <button className="btn ghost s" onClick={() => setActive(p, true)}>Restore</button> : <button className="btn danger s" onClick={() => confirm(`Archive “${p.name}”? It disappears from the shop but past orders keep it.`) && setActive(p, false)}>Archive</button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="mut">{loading ? 'Loading…' : 'No products found.'}</td></tr>}
        </tbody></table></div>
        {total > PAGE && <div className="pager"><button className="btn ghost s" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="cur">Page {page} of {Math.ceil(total / PAGE)}</span><button className="btn ghost s" disabled={page * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button></div>}
      </div>
      {edit && <ProductForm p={edit === 'new' ? null : edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {imp && <ImportModal preview={imp.preview} text={imp.text} onClose={() => setImp(null)} onDone={() => { setImp(null); load(); }} />}
    </>
  );
}

export default function Products() { return <AdminOnly><ProductsInner /></AdminOnly>; }
