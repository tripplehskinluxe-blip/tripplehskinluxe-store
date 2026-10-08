'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, Pill, AdminOnly } from '@/components/admin/ui';
import { naira } from '@/lib/format.js';

// Starting values for a NEW code (editable per code). The date is only pre-filled while it is still in the future.
const DEFAULT_USES = '50', DEFAULT_EXPIRES = '2026-12-30';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const startForm = () => ({ code: '', type: 'percent', value: '', min: '0', maxUses: DEFAULT_USES, expires: DEFAULT_EXPIRES >= today() ? DEFAULT_EXPIRES : '' });
// Nigeria has no daylight saving, so a promo ends at the end of the chosen day, Lagos time (UTC+1)
const endOfDay = (d) => new Date(`${d}T23:59:59+01:00`).toISOString();
const showDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
const stateOf = (d) => (!d.active ? 'Disabled' : d.expires_at && new Date(d.expires_at) <= new Date() ? 'Expired' : d.max_uses != null && d.uses >= d.max_uses ? 'Used up' : 'Active');


function Inner() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(startForm);
  const [edit, setEdit] = useState(null);       // { id, maxUses, expires } while changing the limits of an existing code
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('discounts').select('id,code,type,value,min_order_ngn,active,uses,max_uses,expires_at').order('code');
    if (error) toast('Could not load discounts'); else setRows(data || []);
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  // empty = no limit. Returns the values to save, or an error message
  function parseLimits(maxUses, expires) {
    const mu = String(maxUses).trim();
    if (mu !== '' && (!/^\d{1,7}$/.test(mu) || Number(mu) < 1)) return { error: 'Total uses must be a whole number of 1 or more (or empty for unlimited)' };
    const ex = String(expires).trim();
    if (ex !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(ex) || Number.isNaN(new Date(`${ex}T00:00:00Z`).getTime()))) return { error: 'Enter a valid expiry date (or leave empty for none)' };
    if (ex !== '' && ex < today()) return { error: 'That expiry date has already passed' };
    return { max_uses: mu === '' ? null : Number(mu), expires_at: ex === '' ? null : endOfDay(ex) };
  }
  async function saveLimits(d) {
    const lim = parseLimits(edit.maxUses, edit.expires); if (lim.error) return toast(lim.error);
    const { error } = await sb.from('discounts').update({ max_uses: lim.max_uses, expires_at: lim.expires_at }).eq('id', d.id);
    if (error) return toast('Could not save'); setEdit(null); toast('Limits saved'); load();
  }
  async function create(e) {
    e.preventDefault(); setErr('');
    const code = f.code.trim().toUpperCase(), value = Number(f.value), min = Number(f.min || 0);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return setErr('Code: 3–30 letters, numbers, - or _');
    if (!Number.isInteger(value) || value <= 0 || (f.type === 'percent' && value > 100)) return setErr(f.type === 'percent' ? 'Percent must be 1–100' : 'Enter a whole number of naira');
    if (!Number.isInteger(min) || min < 0) return setErr('Minimum order must be 0 or more');
    const lim = parseLimits(f.maxUses, f.expires); if (lim.error) return setErr(lim.error);
    const { error } = await sb.from('discounts').insert({ code, type: f.type, value, min_order_ngn: min, active: true, max_uses: lim.max_uses, expires_at: lim.expires_at });
    if (error) return setErr(error.code === '23505' ? 'That code already exists' : 'Could not create the code');
    setF(startForm()); toast('Discount created'); load();
  }
  const toggle = async (d) => { const { error } = await sb.from('discounts').update({ active: !d.active }).eq('id', d.id); if (error) toast('Could not update'); else load(); };
  const del = async (d) => { if (!confirm(`Delete ${d.code}?`)) return; const { error } = await sb.from('discounts').delete().eq('id', d.id); if (error) toast('Could not delete'); else load(); };

  return (
    <>
      <PageHead title="Discounts" sub="Promo codes customers can use at checkout. Prices are always re-checked on the server." />
      <div className="gr2">
        <div className="pnl"><div className="tw"><table className="t"><thead><tr><th>Code</th><th>Offer</th><th>Over</th><th>Used</th><th>Expires</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((d) => (
            <tr key={d.id}><td><b>{d.code}</b></td><td>{d.type === 'percent' ? `${d.value}% off` : `${naira(d.value)} off`}</td><td>{d.min_order_ngn ? naira(d.min_order_ngn) : 'Any order'}</td>
              {edit?.id === d.id ? (
                <td colSpan={3}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input className="inp" style={{ width: 120 }} type="number" min="1" placeholder="Total uses" aria-label="Total uses allowed" value={edit.maxUses} onChange={(e) => setEdit({ ...edit, maxUses: e.target.value })} />
                    <input className="inp" style={{ width: 160 }} type="date" aria-label="Expires on" value={edit.expires} onChange={(e) => setEdit({ ...edit, expires: e.target.value })} />
                    <button className="btn s" onClick={() => saveLimits(d)}>Save</button><button className="btn ghost s" onClick={() => setEdit(null)}>Cancel</button>
                  </div>
                  <small className="mut">Empty = unlimited / never expires. Already used: {d.uses}</small>
                </td>
              ) : (<>
                <td>{d.max_uses != null ? `${d.uses} / ${d.max_uses}` : `${d.uses} (no limit)`}</td>
                <td>{d.expires_at ? showDate(d.expires_at) : 'Never'}</td>
                <td><Pill text={stateOf(d)} /></td>
              </>)}
              <td style={{ whiteSpace: 'nowrap' }}>{edit?.id !== d.id && <button className="btn ghost s" onClick={() => setEdit({ id: d.id, maxUses: d.max_uses ?? '', expires: d.expires_at ? new Date(d.expires_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) : '' })}>Limits</button>} <button className="btn ghost s" onClick={() => toggle(d)}>{d.active ? 'Disable' : 'Enable'}</button> <button className="btn danger s" onClick={() => del(d)}>Delete</button></td></tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="mut">No discount codes yet.</td></tr>}
        </tbody></table></div></div>
        <form className="pnl" onSubmit={create}>
          <h3>New code</h3>
          <div className="fld"><label className="f" htmlFor="dc">Code</label><input id="dc" className="inp" style={{ textTransform: 'uppercase' }} value={f.code} maxLength={30} onChange={(e) => setF({ ...f, code: e.target.value })} required /></div>
          <div className="row2">
            <div className="fld"><label className="f">Type</label><select className="sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed ₦</option></select></div>
            <div className="fld"><label className="f">Value</label><input className="inp" type="number" min="1" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></div>
          </div>
          <div className="fld"><label className="f">Applies to orders over (₦)</label><input className="inp" type="number" min="0" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
          <div className="row2">
            <div className="fld"><label className="f" htmlFor="dc_uses">Total uses allowed</label><input id="dc_uses" className="inp" type="number" min="1" placeholder="Unlimited" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></div>
            <div className="fld"><label className="f" htmlFor="dc_exp">Expires on (end of day)</label><input id="dc_exp" className="inp" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></div>
          </div>
          <p className="sm mut" style={{ margin: '0 0 10px' }}>Starts with {DEFAULT_USES} uses{f.expires ? ` and the end of ${showDate(`${f.expires}T12:00:00+01:00`)}` : ''}. Empty a box for unlimited / no expiry. You can change these later with Limits.</p>
          {err && <span className="err" style={{ marginBottom: 10 }}>{err}</span>}
          <button className="btn block">Create code</button>
        </form>
      </div>
    </>
  );
}
export default function Discounts() { return <AdminOnly><Inner /></AdminOnly>; }
