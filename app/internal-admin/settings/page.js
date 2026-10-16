'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import SpecForm, { setIn } from '@/components/admin/SpecForm';
import SpecView from '@/components/admin/SpecView';
import { SPEC, DEFAULT_SETTINGS, buildSettings } from '@/lib/settings-core.js';

const TABS = [['store', 'Business'], ['delivery', 'Delivery'], ['spa', 'Spa menu'], ['faq', 'FAQ'], ['about', 'About'], ['ceo', 'CEO'], ['security', 'Login security']];
const SEC = [
  ['login_max_failures', 'Wrong attempts before a lock', 3, 20],
  ['login_base_lock_minutes', 'First lock (minutes)', 1, 1440],
  ['login_lock_multiplier', 'Each lock is this many times longer', 1, 10],
  ['login_max_lock_minutes', 'Longest lock (minutes)', 1, 43200],
  ['login_reset_after_hours', 'Start again after (hours)', 1, 720],
];

async function toJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  } finally { URL.revokeObjectURL(url); }
}

function Security() {
  const { sb, toast } = useAdmin();
  const [saved, setSaved] = useState(null);
  const [v, setV] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { setFailed(false); sb.rpc('get_security_config').then(({ data, error }) => { if (error || !data) setFailed(true); else { setSaved(data); setV(data); } }); }, [sb]);
  useEffect(() => { load(); }, [load]);
  if (failed) return <p className="mut">Could not load this section. <button className="lnkb" onClick={load}>Try again</button></p>;
  if (!saved) return <p className="mut">Loading…</p>;
  const seq = []; { let m = saved.login_base_lock_minutes; for (let i = 0; i < 5; i++) { seq.push(Math.min(m, saved.login_max_lock_minutes)); m *= saved.login_lock_multiplier; } }
  const save = async () => {
    setBusy(true);
    const { error } = await sb.rpc('save_security_config', { p: v });
    setBusy(false);
    if (error) { toast(/shorter|range|number/i.test(error.message) ? error.message : 'Could not save'); return; }
    setSaved(v); setEditing(false); toast('Saved');
  };
  return (
    <div>
      <div className="sec-h"><h2>Login security</h2>{!editing && <button className="btn ghost s" onClick={() => { setV(saved); setEditing(true); }}>Edit</button>}</div>
      {editing ? (
        <>
          {SEC.map(([k, label, min, max]) => (
            <div className="fld" key={k}><label className="f" htmlFor={k}>{label}</label>
              <input id={k} className="inp" type="number" min={min} max={max} step="1" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></div>
          ))}
          <div className="acts"><button className="btn s" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="btn ghost s" onClick={() => { setV(saved); setEditing(false); }}>Cancel</button></div>
        </>
      ) : (
        <dl style={{ margin: 0 }}>
          {SEC.map(([k, label]) => <div className="vr" key={k}><dt>{label}</dt><dd>{saved[k]}</dd></div>)}
          <div className="vr"><dt>Lock lengths (minutes)</dt><dd>{seq.join(', ')}</dd></div>
        </dl>
      )}
    </div>
  );
}

function Inner() {
  const { sb, toast, token } = useAdmin();
  const [tab, setTab] = useState('store');
  const [saved, setSaved] = useState(null);      // what is stored now
  const [draft, setDraft] = useState(null);      // the form, only used while editing
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('settings').select('key,value');
    if (error) { toast('Could not load the settings'); return; }
    const s = buildSettings(data); setSaved(s); setDraft(structuredClone(s));
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => !!(editing && saved && draft && JSON.stringify(draft[tab]) !== JSON.stringify(saved[tab])), [editing, saved, draft, tab]);
  const pick = (k) => {
    if (k === tab) return;
    if (dirty && !confirm('Discard your changes?')) return;
    setEditing(false); setErr(''); setDraft(structuredClone(saved)); setTab(k);
  };
  const startEdit = () => { setDraft(structuredClone(saved)); setErr(''); setEditing(true); };
  const cancel = () => { setDraft(structuredClone(saved)); setErr(''); setEditing(false); };
  const change = (path, val) => { setErr(''); setDraft((d) => ({ ...d, [tab]: setIn(d[tab], path, val) })); };

  async function upload(path, e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const blob = await toJpeg(file);
      const name = `site/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('products').upload(name, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      setDraft((d) => ({ ...d, [tab]: setIn(d[tab], path, sb.storage.from('products').getPublicUrl(name).data.publicUrl) }));
    } catch { toast('The photo could not be uploaded'); }
    setBusy(false);
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/admin/settings', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: tab, value: draft[tab] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not save'); setBusy(false); return; }
      setSaved((s) => ({ ...s, [tab]: d.value })); setDraft((x) => ({ ...x, [tab]: structuredClone(d.value) }));
      setEditing(false); toast('Saved');
    } catch { setErr('Network problem. Nothing was saved.'); }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="Settings" />
      <nav className="tabs">{TABS.map(([k, label]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => pick(k)}>{label}</button>)}</nav>
      {!saved ? <p className="mut">Loading…</p> : tab === 'security' ? <Security /> : (
        <div>
          <div className="sec-h"><h2>{SPEC[tab].label}</h2>{!editing && <button className="btn ghost s" onClick={startEdit}>Edit</button>}</div>
          {editing ? (
            <>
              <SpecForm spec={SPEC[tab]} value={draft[tab]} onChange={change} onUpload={tab === 'ceo' || tab === 'store' ? upload : undefined} busy={busy} hideTitle />
              {err && <span className="err" style={{ margin: '12px 0', display: 'block' }}>{err}</span>}
              <div className="acts">
                <button className="btn s" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
                <button className="btn ghost s" onClick={cancel} disabled={busy}>Cancel</button>
                <button className="lnkb" style={{ marginLeft: 'auto' }} onClick={() => { if (confirm('Fill this section with the starting values?')) setDraft((d) => ({ ...d, [tab]: structuredClone(DEFAULT_SETTINGS[tab]) })); }}>Use starting values</button>
              </div>
            </>
          ) : <SpecView spec={SPEC[tab]} value={saved[tab]} />}
        </div>
      )}
    </>
  );
}
export default function SettingsPage() { return <AdminOnly><Inner /></AdminOnly>; }
