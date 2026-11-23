'use client';
// Delivery zones (admin only). Every save runs a database function that checks the admin login and two-factor again.
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import { STATES } from '@/lib/ng-areas.js';
import { LAGOS_LGAS } from '@/lib/shipping-core.js';

const feeOrNull = (s) => (String(s ?? '').trim() === '' ? null : Number(s));
const aliasList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const box = { padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14 };
const card = { background: '#fff', border: '1.5px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 18 };
const btn = { padding: '8px 14px', borderRadius: 999, border: '1.5px solid var(--p)', background: '#fff', color: 'var(--p)', cursor: 'pointer' };
const solid = { ...btn, background: 'var(--p)', color: '#fff' };

function ZoneRow({ z, run }) {
  const [name, setName] = useState(z.name);
  const [fee, setFee] = useState(z.fee_ngn ?? '');
  const [active, setActive] = useState(z.active);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <input style={{ ...box, flex: 2, minWidth: 160 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Zone name" />
      <input style={{ ...box, width: 130 }} type="number" min="0" placeholder="Fee (blank = not set)" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Zone fee" />
      <label style={{ fontSize: 14 }}><input type="checkbox" checked={active} disabled={z.kind === 'interstate'} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <button style={solid} onClick={() => run('shipping_save_zone', { p_id: z.id, p_name: name, p_fee: feeOrNull(fee), p_active: active, p_sort: z.sort_order }, 'Zone saved')}>Save</button>
      {z.kind === 'interstate' && <span style={{ fontSize: 12, color: 'var(--mut)' }}>Inter-state (flat rate for every state not listed below)</span>}
    </div>
  );
}

function AreaRow({ a, zones, lgas, run }) {
  const [name, setName] = useState(a.name);
  const [aliases, setAliases] = useState((a.aliases || []).join(', '));
  const [zone, setZone] = useState(a.zone_id || '');
  const [fee, setFee] = useState(a.fee_ngn ?? '');
  const [active, setActive] = useState(a.active);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <input style={{ ...box, width: 150 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Area name" />
      <input style={{ ...box, width: 170 }} placeholder="Other names, comma separated" value={aliases} onChange={(e) => setAliases(e.target.value)} aria-label="Other names" />
      <select style={box} value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone">
        <option value="">Local government zone</option>
        {zones.filter((z) => z.kind === 'zone' && z.active).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
      </select>
      <input style={{ ...box, width: 120 }} type="number" min="0" placeholder="Fee (blank = zone price)" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Area fee" />
      <label style={{ fontSize: 14 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <button style={solid} onClick={() => run('shipping_save_area', { p_id: a.id, p_lga: a.lga, p_name: name, p_aliases: aliasList(aliases), p_zone: zone || null, p_fee: feeOrNull(fee), p_active: active }, 'Area saved')}>Save</button>
      <button style={btn} onClick={() => run('shipping_delete_area', { p_id: a.id }, 'Area deleted')}>Delete</button>
    </div>
  );
}

function CityRow({ c, run }) {
  const [city, setCity] = useState(c.city);
  const [fee, setFee] = useState(c.fee_ngn ?? '');
  const [active, setActive] = useState(c.active);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontSize: 14, minWidth: 130 }}>{c.state}</span>
      <input style={{ ...box, width: 170 }} value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" />
      <input style={{ ...box, width: 130 }} type="number" min="0" placeholder="Fee (blank = flat rate)" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="City fee" />
      <label style={{ fontSize: 14 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <button style={solid} onClick={() => run('shipping_save_city', { p_id: c.id, p_state: c.state, p_city: city, p_fee: feeOrNull(fee), p_active: active }, 'City saved')}>Save</button>
      <button style={btn} onClick={() => run('shipping_delete_city', { p_id: c.id }, 'City deleted')}>Delete</button>
    </div>
  );
}

function Inner() {
  const { sb, toast } = useAdmin();
  const [snap, setSnap] = useState(null);
  const [newZone, setNewZone] = useState({ name: '', fee: '' });
  const [newArea, setNewArea] = useState({ lga: LAGOS_LGAS[0], name: '', aliases: '', zone: '', fee: '', active: true });
  const [newCity, setNewCity] = useState({ state: 'FCT - Abuja', city: '', fee: '', active: true });

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('shipping_admin_snapshot');
    if (error) toast(error.message); else setSnap(data);
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, args, ok) => {
    const { error } = await sb.rpc(fn, args);
    if (error) { toast(error.message); return false; }
    toast(ok); await load(); return true;
  };

  if (!snap) return <div className="box">Loading delivery zones…</div>;
  const zones = snap.zones || [];
  const areasByLga = (lga) => (snap.areas || []).filter((a) => a.lga === lga);
  const lgaZone = new Map((snap.lgas || []).map((l) => [l.name, l.zone_id]));

  return (
    <>
      <PageHead title="Delivery zones" />
      <p className="mut" style={{ marginBottom: 14 }}>How checkout prices delivery: the local government is the anchor. A specific area inside it can have its own zone or fee. A blank price uses the Settings fee until you set one.</p>

      <div style={card}>
        <h3 style={{ marginBottom: 6 }}>1. Zones and prices</h3>
        {zones.map((z) => <ZoneRow key={z.id} z={z} run={run} />)}
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); if (await run('shipping_save_zone', { p_id: null, p_name: newZone.name, p_fee: feeOrNull(newZone.fee), p_active: true, p_sort: 50 }, 'Zone added')) setNewZone({ name: '', fee: '' }); }}>
          <input style={{ ...box, flex: 2, minWidth: 160 }} placeholder="New zone name" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} aria-label="New zone name" />
          <input style={{ ...box, width: 130 }} type="number" min="0" placeholder="Fee (blank = not set)" value={newZone.fee} onChange={(e) => setNewZone({ ...newZone, fee: e.target.value })} aria-label="New zone fee" />
          <button style={solid}>Add zone</button>
        </form>
      </div>

      <div style={card}>
        <h3 style={{ marginBottom: 6 }}>2. Which zone each local government uses</h3>
        <p className="mut" style={{ fontSize: 13, marginBottom: 8 }}>A customer in a local government with no specific area match gets this zone&apos;s price.</p>
        {(snap.lgas || []).map((l) => (
          <LgaRow key={l.name} name={l.name} zoneId={lgaZone.get(l.name)} zones={zones} run={run} />
        ))}
      </div>

      <div style={card}>
        <h3 style={{ marginBottom: 6 }}>3. Specific areas inside each local government</h3>
        <p className="mut" style={{ fontSize: 13, marginBottom: 8 }}>An area is recommended when the customer&apos;s address names it. Use &quot;Other names&quot; for spellings customers use (for example Imude-Shibiri).</p>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} onSubmit={async (e) => { e.preventDefault(); if (await run('shipping_save_area', { p_id: null, p_lga: newArea.lga, p_name: newArea.name, p_aliases: aliasList(newArea.aliases), p_zone: newArea.zone || null, p_fee: feeOrNull(newArea.fee), p_active: newArea.active }, 'Area added')) setNewArea({ ...newArea, name: '', aliases: '', fee: '' }); }}>
          <select style={box} value={newArea.lga} onChange={(e) => setNewArea({ ...newArea, lga: e.target.value })} aria-label="Local government">
            {LAGOS_LGAS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input style={{ ...box, width: 150 }} placeholder="Area name" value={newArea.name} onChange={(e) => setNewArea({ ...newArea, name: e.target.value })} aria-label="New area name" />
          <input style={{ ...box, width: 170 }} placeholder="Other names, comma separated" value={newArea.aliases} onChange={(e) => setNewArea({ ...newArea, aliases: e.target.value })} aria-label="New area other names" />
          <select style={box} value={newArea.zone} onChange={(e) => setNewArea({ ...newArea, zone: e.target.value })} aria-label="New area zone">
            <option value="">Local government zone</option>
            {zones.filter((z) => z.kind === 'zone' && z.active).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <input style={{ ...box, width: 120 }} type="number" min="0" placeholder="Fee (blank = zone price)" value={newArea.fee} onChange={(e) => setNewArea({ ...newArea, fee: e.target.value })} aria-label="New area fee" />
          <button style={solid}>Add area</button>
        </form>
        {(snap.lgas || []).map((l) => {
          const rows = areasByLga(l.name);
          if (!rows.length) return null;
          return (
            <div key={l.name} style={{ marginBottom: 12 }}>
              <b>{l.name}</b>
              {rows.map((a) => <AreaRow key={a.id} a={a} zones={zones} lgas={snap.lgas} run={run} />)}
            </div>
          );
        })}
      </div>

      <div style={card}>
        <h3 style={{ marginBottom: 6 }}>4. Other states: city rates</h3>
        <p className="mut" style={{ fontSize: 13, marginBottom: 8 }}>A city listed here uses its own fee. Any other address outside Lagos uses the Inter-state flat rate in section 1.</p>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} onSubmit={async (e) => { e.preventDefault(); if (await run('shipping_save_city', { p_id: null, p_state: newCity.state, p_city: newCity.city, p_fee: feeOrNull(newCity.fee), p_active: newCity.active }, 'City added')) setNewCity({ ...newCity, city: '', fee: '' }); }}>
          <select style={box} value={newCity.state} onChange={(e) => setNewCity({ ...newCity, state: e.target.value })} aria-label="State">
            {STATES.filter((s) => s !== 'Lagos').map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={{ ...box, width: 170 }} placeholder="City" value={newCity.city} onChange={(e) => setNewCity({ ...newCity, city: e.target.value })} aria-label="New city" />
          <input style={{ ...box, width: 130 }} type="number" min="0" placeholder="Fee (blank = flat rate)" value={newCity.fee} onChange={(e) => setNewCity({ ...newCity, fee: e.target.value })} aria-label="New city fee" />
          <button style={solid}>Add city</button>
        </form>
        {(snap.cities || []).map((c) => <CityRow key={c.id} c={c} run={run} />)}
      </div>
    </>
  );
}

function LgaRow({ name, zoneId, zones, run }) {
  const [zone, setZone] = useState(zoneId || '');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ minWidth: 170 }}>{name}</span>
      <select style={box} value={zone} onChange={(e) => setZone(e.target.value)} aria-label={`Zone for ${name}`}>
        {zones.filter((z) => z.kind === 'zone' && z.active).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
      </select>
      <button style={solid} onClick={() => run('shipping_save_lga', { p_name: name, p_zone: zone }, `${name} saved`)}>Save</button>
    </div>
  );
}

export default function ShippingAdmin() { return <AdminOnly><Inner /></AdminOnly>; }
