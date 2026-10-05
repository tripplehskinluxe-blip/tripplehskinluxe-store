'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import SpecForm, { setIn } from '@/components/admin/SpecForm';
import { SPEC, SETTING_KEYS, DEFAULT_SETTINGS, buildSettings } from '@/lib/settings-core.js';

const TABS = [['store', 'Business & contact'], ['delivery', 'Delivery & returns'], ['spa', 'Spa menu & prices'], ['faq', 'FAQ'], ['about', 'About page'], ['ceo', 'CEO page'], ['security', 'Login security']];
const SEC = [
  ['login_max_failures', 'Wrong passwords before a lock', 3, 20],
  ['login_base_lock_minutes', 'First lock lasts (minutes)', 1, 1440],
  ['login_lock_multiplier', 'Each next lock is this many times longer', 1, 10],
  ['login_max_lock_minutes', 'A lock never lasts longer than (minutes)', 1, 43200],
  ['login_reset_after_hours', 'Start again from the first lock after this many quiet hours', 1, 720],
];

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

function Security() {
  const { sb, toast } = useAdmin();
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { sb.rpc('get_security_config').then(({ data, error }) => { if (error) toast('Could not load the security settings'); else setV(data); }); }, [sb, toast]);
  if (!v) return <p className="mut">Loading…</p>;
  const seq = []; { let m = v.login_base_lock_minutes; for (let i = 0; i < 6; i++) { seq.push(Math.min(m, v.login_max_lock_minutes)); m *= v.login_lock_multiplier; } }
  const save = async () => {
    setBusy(true);
    const { error } = await sb.rpc('save_security_config', { p: v });
    setBusy(false);
    toast(error ? (/shorter|range|number/i.test(error.message) ? error.message : 'Could not save') : 'Saved. The new rules apply immediately.');
  };
  return (
    <div>
      <p className="mut sm" style={{ marginBottom: 14 }}>Applies to team sign-in. These rules are enforced on the server and stored in the database.</p>
      {SEC.map(([k, label, min, max]) => (
        <div className="fld" key={k}><label className="f" htmlFor={k}>{label}</label>
          <input id={k} className="inp" type="number" min={min} max={max} step="1" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></div>
      ))}
      <p className="sm" style={{ margin: '4px 0 16px' }}>With these numbers the locks last: <b>{seq.join(' → ')} minutes</b>, and then stay at the longest.</p>
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save security settings'}</button>
    </div>
  );
}

function Inner() {
  const { sb, toast, token } = useAdmin();
  const [tab, setTab] = useState('store');
  const [saved, setSaved] = useState(null);      // what is stored now
  const [draft, setDraft] = useState(null);      // what is on screen
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('settings').select('key,value');
    if (error) { toast('Could not load the settings'); return; }
    const s = buildSettings(data); setSaved(s); setDraft(structuredClone(s));
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => (draft && saved ? Object.fromEntries(SETTING_KEYS.map((k) => [k, JSON.stringify(draft[k]) !== JSON.stringify(saved[k])])) : {}), [draft, saved]);

  const change = (key) => (path, val) => { setErr(''); setDraft((d) => ({ ...d, [key]: setIn(d[key], path, val) })); };

  async function upload(path, e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const blob = await toJpeg(file);
      const name = `site/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('products').upload(name, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      setDraft((d) => ({ ...d, ceo: setIn(d.ceo, path, sb.storage.from('products').getPublicUrl(name).data.publicUrl) }));
    } catch { toast('The photo could not be uploaded'); }
    setBusy(false);
  }

  async function save(key) {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/admin/settings', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value: draft[key] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not save'); toast(d.error || 'Could not save'); setBusy(false); return; }
      setSaved((s) => ({ ...s, [key]: d.value })); setDraft((x) => ({ ...x, [key]: structuredClone(d.value) }));
      toast('Saved. The shop is updated.');
    } catch { toast('Network problem. Nothing was saved.'); }
    setBusy(false);
  }

  const reset = (key) => { if (confirm('Fill this page with the original starting values? Nothing changes until you press Save.')) setDraft((d) => ({ ...d, [key]: structuredClone(DEFAULT_SETTINGS[key]) })); };

  return (
    <>
      <PageHead title="Settings" sub="Everything the shop shows or charges: contact details, delivery fees, spa prices, FAQ, About and CEO pages. Changes go live as soon as you save." />
      <div className="pnl">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {TABS.map(([k, label]) => <button key={k} className={`btn s ${k === tab ? '' : 'ghost'}`} onClick={() => { setTab(k); setErr(''); }}>{label}{dirty[k] ? ' •' : ''}</button>)}
        </div>
        {!draft ? <p className="mut">Loading…</p> : tab === 'security' ? <Security /> : (
          <>
            {dirty[tab] && <p className="sm" style={{ color: '#a35a00', marginBottom: 12 }}>You have unsaved changes on this page.</p>}
            <SpecForm spec={SPEC[tab]} value={draft[tab]} onChange={change(tab)} onUpload={tab === 'ceo' ? upload : undefined} busy={busy} hideTitle />
            {err && <span className="err" style={{ margin: '8px 0', display: 'block' }}>{err}</span>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn" onClick={() => save(tab)} disabled={busy || !dirty[tab]}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn ghost" onClick={() => reset(tab)} disabled={busy}>Fill with starting values</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
export default function SettingsPage() { return <AdminOnly><Inner /></AdminOnly>; }
