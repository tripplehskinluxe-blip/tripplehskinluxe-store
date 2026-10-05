'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import { supabaseBrowser } from '@/lib/supabase-browser.js';
import { logoParts } from '@/lib/format.js';
import { useSettings } from '../SettingsProvider';

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);
export const ADMIN_BASE = '/' + (process.env.NEXT_PUBLIC_ADMIN_PATH || '').replace(/^\/+|\/+$/g, '');
const IDLE_MS = 30 * 60 * 1000; // sign out after 30 minutes of no activity
// 4th value = admin-only (staff don't see it; the database enforces this too)
const NAV = [['', 'Dashboard', 'grid'], ['/orders', 'Orders', 'box'], ['/pos', 'In-store sales', 'bag'], ['/products', 'Products', 'tag', true], ['/inventory', 'Inventory', 'box'], ['/customers', 'Customers', 'users'], ['/discounts', 'Discounts', 'tag', true], ['/reviews', 'Reviews', 'star', true], ['/settings', 'Settings', 'grid', true], ['/pages', 'Legal pages', 'shield', true], ['/analytics', 'Analytics', 'chart', true]];

const Center = ({ children }) => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8f5fc', padding: 20 }}>
    <div className="box" style={{ width: 'min(430px,100%)' }}>{children}</div>
  </div>
);

function SignIn({ sb, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // The password check and the lockout (5 wrong tries -> 15 min, then 30, 60 ...) happen on the SERVER (/api/admin/login).
  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(fd.get('email')).trim(), password: String(fd.get('password')) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.session) { setErr(d.error || 'Could not sign in. Please try again.'); setBusy(false); return; }
      const { error } = await sb.auth.setSession({ access_token: d.session.access_token, refresh_token: d.session.refresh_token });
      setBusy(false);
      if (error) { setErr('Could not start your session. Please try again.'); return; }
      onDone();
    } catch { setBusy(false); setErr('Network problem. Check your connection and try again.'); }
  }
  return (
    <Center>
      <h2 style={{ fontSize: 30, marginBottom: 6 }}>Sign in</h2><p className="mut" style={{ marginBottom: 20 }}>Team access only.</p>
      <form onSubmit={submit}>
        <div className="fld"><label className="f" htmlFor="em">Email</label><input id="em" className="inp" name="email" type="email" autoComplete="username" required /></div>
        <div className="fld"><label className="f" htmlFor="pw">Password</label><input id="pw" className="inp" name="password" type="password" autoComplete="current-password" required /></div>
        {err && <span className="err" style={{ marginBottom: 12 }}>{err}</span>}
        <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Center>
  );
}

function MfaEnroll({ sb, onDone }) {
  const [f, setF] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      const { data: l } = await sb.auth.mfa.listFactors();
      for (const x of (l?.all || []).filter((x) => x.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator ' + Date.now() });
      if (error) setErr(error.message); else setF(data);
    })();
  }, [sb]);
  async function verify(e) {
    e.preventDefault(); setErr('');
    const ch = await sb.auth.mfa.challenge({ factorId: f.id });
    if (ch.error) { setErr(ch.error.message); return; }
    const v = await sb.auth.mfa.verify({ factorId: f.id, challengeId: ch.data.id, code: code.trim() });
    if (v.error) { setErr('That code is not right. Use the newest code from your app.'); return; }
    onDone();
  }
  return (
    <Center>
      <h2 style={{ fontSize: 28, marginBottom: 6 }}>Set up two-factor</h2>
      <p className="mut" style={{ marginBottom: 16 }}>Scan this with Google Authenticator, Microsoft Authenticator or Authy, then enter the 6-digit code. Required for everyone on the team.</p>
      {f ? (
        <form onSubmit={verify}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}><img src={f.totp.qr_code} alt="Two-factor QR code" width={190} height={190} style={{ display: 'inline-block' }} /></div>
          <p className="sm mut" style={{ textAlign: 'center', marginBottom: 14, wordBreak: 'break-all' }}>Can&apos;t scan? Enter this key: <b>{f.totp.secret}</b></p>
          <div className="fld"><label className="f" htmlFor="c">6-digit code</label><input id="c" className="inp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></div>
          {err && <span className="err" style={{ marginBottom: 12 }}>{err}</span>}
          <button className="btn block">Verify and continue</button>
        </form>
      ) : <p className="mut">{err || 'Preparing…'}</p>}
    </Center>
  );
}

function MfaVerify({ sb, factorId, onDone }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  async function verify(e) {
    e.preventDefault(); setErr('');
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error) { setErr(ch.error.message); return; }
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() });
    if (v.error) { setErr('That code is not right.'); return; }
    onDone();
  }
  return (
    <Center>
      <h2 style={{ fontSize: 28, marginBottom: 6 }}>Enter your code</h2><p className="mut" style={{ marginBottom: 18 }}>Open your authenticator app and enter the 6-digit code.</p>
      <form onSubmit={verify}>
        <div className="fld"><input className="inp" aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required /></div>
        {err && <span className="err" style={{ marginBottom: 12 }}>{err}</span>}
        <button className="btn block">Verify</button>
        <button type="button" className="lnk sm" style={{ marginTop: 14 }} onClick={() => sb.auth.signOut()}>Use a different account</button>
      </form>
    </Center>
  );
}

export default function AdminProvider({ children }) {
  const { store } = useSettings();
  const sb = useMemo(() => supabaseBrowser(), []);
  const [s, setS] = useState({ phase: 'loading' });
  const [msg, setMsg] = useState('');
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const toast = useCallback((m) => { setMsg(m); clearTimeout(window.__thsAdm); window.__thsAdm = setTimeout(() => setMsg(''), 2800); }, []);

  const evaluate = useCallback(async () => {
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return setS({ phase: 'signin' });
    const { data: prof } = await sb.from('profiles').select('role,full_name').eq('id', session.user.id).single();
    if (!prof || !['admin', 'staff'].includes(prof.role)) return setS({ phase: 'forbidden' });
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return setS({ phase: 'ready', role: prof.role, name: prof.full_name || session.user.email });
    const { data: fs } = await sb.auth.mfa.listFactors();
    const totp = fs?.totp?.find((x) => x.status === 'verified');
    return setS(totp ? { phase: 'mfa-verify', factorId: totp.id } : { phase: 'mfa-enroll' });
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    evaluate();
    const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') setS({ phase: 'signin' }); });
    return () => sub.subscription.unsubscribe();
  }, [sb, evaluate]);

  useEffect(() => {
    if (s.phase !== 'ready') return;
    let t;
    const reset = () => { clearTimeout(t); t = setTimeout(() => sb.auth.signOut(), IDLE_MS); };
    const evs = ['click', 'keydown', 'touchstart', 'mousemove'];
    evs.forEach((e) => window.addEventListener(e, reset)); reset();
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [s.phase, sb]);

  useEffect(() => { setMenu(false); }, [path]);

  if (!sb) return <Center><h2 style={{ fontSize: 26, marginBottom: 8 }}>Not connected</h2><p className="mut">Connect Supabase (see README, “Go live”) to use this area.</p></Center>;
  if (s.phase === 'loading') return <Center><p className="mut">Loading…</p></Center>;
  if (s.phase === 'signin') return <SignIn sb={sb} onDone={evaluate} />;
  if (s.phase === 'forbidden') return <Center><h2 style={{ fontSize: 26, marginBottom: 8 }}>No access</h2><p className="mut" style={{ marginBottom: 18 }}>This account is not part of the team.</p><button className="btn ghost block" onClick={() => sb.auth.signOut()}>Sign out</button></Center>;
  if (s.phase === 'mfa-enroll') return <MfaEnroll sb={sb} onDone={evaluate} />;
  if (s.phase === 'mfa-verify') return <MfaVerify sb={sb} factorId={s.factorId} onDone={evaluate} />;

  const [top, sub] = logoParts(store.name);
  const token = async () => (await sb.auth.getSession()).data.session?.access_token;
  const active = (p) => (p === '' ? path === ADMIN_BASE || path === ADMIN_BASE + '/' : path.startsWith(ADMIN_BASE + p));
  return (
    <Ctx.Provider value={{ sb, toast, role: s.role, token, base: ADMIN_BASE }}>
      <div className="adm">
        <aside className={`side ${menu ? 'open' : ''}`}>
          <Link className="logo" href={ADMIN_BASE}>{top}<small>TEAM</small></Link>
          {NAV.filter((n) => !n[3] || s.role === 'admin').map(([p, label, icon]) => <Link key={label} href={ADMIN_BASE + p} className={active(p) ? 'on' : ''}><Icon n={icon} s={18} />{label}</Link>)}
          <Link href="/" style={{ marginTop: 20, borderTop: '1px solid #3b2558', borderRadius: 0, paddingTop: 18 }}><Icon n="out" s={18} />View storefront</Link>
        </aside>
        <div className="adm-main">
          <div className="adm-top">
            <button className="ib m-only" onClick={() => setMenu(!menu)} aria-label="Menu"><Icon n="menu" /></button>
            <span className="mut sm" style={{ flex: 1 }}>{store.name}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="av">{String(s.name).slice(0, 2).toUpperCase()}</span>
              <span className="d-only sm"><b>{s.name}</b><br /><span className="mut">{s.role}</span></span>
              <button className="btn ghost s" onClick={() => sb.auth.signOut()}>Sign out</button>
            </div>
          </div>
          <div className="adm-body">{children}</div>
        </div>
      </div>
      <div id="toast" className={msg ? 'show' : ''} role="status" aria-live="polite" style={{ bottom: 30 }}>{msg}</div>
    </Ctx.Provider>
  );
}
