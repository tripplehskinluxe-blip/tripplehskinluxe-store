'use client';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Modal, safeSearch } from '@/components/admin/ui';
import Icon from '@/components/Icon';
import { naira } from '@/lib/format.js';
import { useSettings } from '@/components/SettingsProvider';

const METHODS = [['cash', 'Cash'], ['pos_terminal', 'POS terminal'], ['bank_transfer', 'Bank transfer']];

export default function Pos() {
  const { sb, toast } = useAdmin();
  const { store } = useSettings();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [items, setItems] = useState([]);       // [{ id, name, price, stock, qty }]
  const [method, setMethod] = useState('cash');
  const [cust, setCust] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    const s = safeSearch(q);
    const t = setTimeout(async () => {
      let qb = sb.from('products').select('id,name,sku,price_ngn,stock').eq('is_active', true).order('name').limit(8);
      if (s) qb = qb.or(`name.ilike.%${s}%,sku.ilike.%${s}%`);
      const { data } = await qb; setResults(data || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, sb]);

  const add = (p) => {
    const cur = items.find((i) => i.id === p.id), n = (cur?.qty || 0) + 1;
    if (n > p.stock) return toast(`Only ${p.stock} in stock`);
    setItems(cur ? items.map((i) => (i.id === p.id ? { ...i, qty: n } : i)) : [...items, { id: p.id, name: p.name, price: p.price_ngn, stock: p.stock, qty: 1 }]);
  };
  const step = (i, d) => setItems(items.map((x) => (x.id === i.id ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0).map((x) => ({ ...x, qty: Math.min(x.qty, x.stock) })));
  const total = items.reduce((a, i) => a + i.price * i.qty, 0);

  async function complete() {
    setBusy(true);
    const { data: num, error } = await sb.rpc('record_pos_sale', { p_items: items.map((i) => ({ product_id: i.id, qty: i.qty })), p_method: method, p_name: cust.name.trim() || null, p_phone: cust.phone.trim() || null });
    if (error) { setBusy(false); return toast(/stock/i.test(error.message) ? 'Not enough stock for one of the items' : 'Could not record the sale'); }
    const { data: o } = await sb.from('orders').select('total_ngn').eq('order_number', num).maybeSingle();
    setReceipt({ num, total: o?.total_ngn ?? total, items, method, phone: cust.phone.trim() });
    setItems([]); setCust({ name: '', phone: '' }); setBusy(false);
  }
  const waText = (r) => `Thank you for shopping at ${store.name}!\nReceipt ${r.num}\n${r.items.map((i) => `${i.name} x${i.qty}`).join('\n')}\nTotal: ${naira(r.total)}`;

  return (
    <>
      <PageHead title="In-store sales" sub="Ring up a counter sale. It uses the same stock as the website." />
      <div className="gr2">
        <div className="pnl">
          <h3>Find a product</h3>
          <input className="inp" placeholder="Search by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
          <div style={{ marginTop: 12 }}>
            {results.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{p.name}</b><br /><span className="mut sm">{p.sku} · {naira(p.price_ngn)} · {p.stock} in stock</span></div>
                <button className="btn ghost s" onClick={() => add(p)} disabled={p.stock <= 0}>Add</button>
              </div>
            ))}
            {!results.length && <p className="mut">No matching products.</p>}
          </div>
        </div>
        <div className="pnl">
          <h3>Current sale</h3>
          {items.length ? items.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{i.name}</b><br /><span className="mut sm">{naira(i.price)}</span></div>
              <div className="qty"><button onClick={() => step(i, -1)} aria-label="Decrease"><Icon n="minus" s={14} /></button><span>{i.qty}</span><button onClick={() => add({ id: i.id, name: i.name, price_ngn: i.price, stock: i.stock })} aria-label="Increase"><Icon n="plus" s={14} /></button></div>
              <b style={{ minWidth: 80, textAlign: 'right' }}>{naira(i.price * i.qty)}</b>
            </div>
          )) : <p className="mut" style={{ padding: '14px 0' }}>No items yet. Search and add products on the left.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 600, padding: '16px 0' }}><span>Total</span><span>{naira(total)}</span></div>
          <div className="fld"><label className="f">Payment method</label><select className="sel" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="row2">
            <div className="fld"><label className="f">Customer name (optional)</label><input className="inp" value={cust.name} maxLength={100} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></div>
            <div className="fld"><label className="f">Phone (optional)</label><input className="inp" type="tel" value={cust.phone} maxLength={20} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></div>
          </div>
          <button className="btn block" onClick={complete} disabled={!items.length || busy}>{busy ? 'Recording…' : `Complete sale · ${naira(total)}`}</button>
          <p className="sm mut" style={{ marginTop: 10 }}>The total is recalculated from current prices when the sale is recorded.</p>
        </div>
      </div>
      {receipt && (
        <Modal onClose={() => setReceipt(null)}>
          <div className="center"><div className="ok-ic"><Icon n="check" s={34} /></div><h3>Sale complete</h3><p className="mut">{receipt.num} · {METHODS.find((m) => m[0] === receipt.method)?.[1]}</p></div>
          <div style={{ margin: '18px 0' }}>{receipt.items.map((i) => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}><span>{i.name} × {i.qty}</span><span>{naira(i.price * i.qty)}</span></div>)}<div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontSize: 20, fontWeight: 600 }}><span>Total</span><span>{naira(receipt.total)}</span></div></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn ghost" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${receipt.phone.replace(/\D/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(waText(receipt))}`}>Send receipt on WhatsApp</a>
            <button className="btn" onClick={() => setReceipt(null)}>New sale</button>
          </div>
        </Modal>
      )}
    </>
  );
}
