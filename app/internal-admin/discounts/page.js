'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, AdminOnly } from '@/components/admin/ui';
import { naira } from '@/lib/format.js';

function Inner() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ code: '', type: 'percent', value: '', min: '0' });
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('discounts').select('id,code,type,value,min_order_ngn,active,uses').order('code');
    if (error) toast('Could not load discounts'); else setRows(data || []);
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault(); setErr('');
    const code = f.code.trim().toUpperCase(), value = Number(f.value), min = Number(f.min || 0);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return setErr('Code: 3–30 letters, numbers, - or _');
    if (!Number.isInteger(value) || value <= 0 || (f.type === 'percent' && value > 100)) return setErr(f.type === 'percent' ? 'Percent must be 1–100' : 'Enter a whole number of naira');
    if (!Number.isInteger(min) || min < 0) return setErr('Minimum order must be 0 or more');
    const { error } = await sb.from('discounts').insert({ code, type: f.type, value, min_order_ngn: min, active: true });
    if (error) return setErr(error.code === '23505' ? 'That code already exists' : 'Could not create the code');
    setF({ code: '', type: 'percent', value: '', min: '0' }); toast('Discount created'); load();
  }
  const toggle = async (d) => { const { error } = await sb.from('discounts').update({ active: !d.active }).eq('id', d.id); if (error) toast('Could not update'); else load(); };
  const del = async (d) => { if (!confirm(`Delete ${d.code}?`)) return; const { error } = await sb.from('discounts').delete().eq('id', d.id); if (error) toast('Could not delete'); else load(); };

  return (
    <>
      <PageHead title="Discounts" sub="Promo codes customers can use at checkout. Prices are always re-checked on the server." />
      <div className="gr2">
        <div className="pnl"><div className="tw"><table className="t"><thead><tr><th>Code</th><th>Offer</th><th>Over</th><th>Used</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((d) => (
            <tr key={d.id}><td><b>{d.code}</b></td><td>{d.type === 'percent' ? `${d.value}% off` : `${naira(d.value)} off`}</td><td>{d.min_order_ngn ? naira(d.min_order_ngn) : 'Any order'}</td><td>{d.uses}</td><td><Pill text={d.active ? 'Active' : 'Inactive'} /></td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost s" onClick={() => toggle(d)}>{d.active ? 'Disable' : 'Enable'}</button> <button className="btn danger s" onClick={() => del(d)}>Delete</button></td></tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="mut">No discount codes yet.</td></tr>}
        </tbody></table></div></div>
        <form className="pnl" onSubmit={create}>
          <h3>New code</h3>
          <div className="fld"><label className="f" htmlFor="dc">Code</label><input id="dc" className="inp" style={{ textTransform: 'uppercase' }} value={f.code} maxLength={30} onChange={(e) => setF({ ...f, code: e.target.value })} required /></div>
          <div className="row2">
            <div className="fld"><label className="f">Type</label><select className="sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed ₦</option></select></div>
            <div className="fld"><label className="f">Value</label><input className="inp" type="number" min="1" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></div>
          </div>
          <div className="fld"><label className="f">Applies to orders over (₦)</label><input className="inp" type="number" min="0" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
          {err && <span className="err" style={{ marginBottom: 10 }}>{err}</span>}
          <button className="btn block">Create code</button>
        </form>
      </div>
    </>
  );
}
export default function Discounts() { return <AdminOnly><Inner /></AdminOnly>; }
