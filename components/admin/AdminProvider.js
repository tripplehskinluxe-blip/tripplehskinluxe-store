'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import { supabaseBrowser } from '@/lib/supabase-browser.js';
import Logo from '../Logo';
import { useSettings } from '../SettingsProvider';

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);
export const ADMIN_BASE = '/' + (process.env.NEXT_PUBLIC_ADMIN_PATH || '').replace(/^\/+|\/+$/g, '');
const IDLE_MS = 30 * 60 * 1000; // sign out after 30 minutes of no activity
// 4th value = admin-only (staff don't see it; the database enforces this too)
const NAV = [['', 'Dashboard', 'grid'], ['/orders', 'Orders', 'box'], ['/pos', 'In-store sales', 'bag'], ['/products', 'Products', 'tag', true], ['/categories', 'Categories', 'layers', true], ['/inventory', 'Inventory', 'box'], ['/customers', 'Customers', 'users'], ['/discounts', 'Discounts', 'tag', true], ['/reviews', 'Reviews', 'star', true], ['/team', 'Team', 'users', true], ['/settings', 'Settings', 'grid', true], ['/pages', 'Legal pages', 'shield', true], ['/analytics', 'Analytics', 'chart', true]];

const Center = ({ children }) => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8f5fc', padding: 20 }}>
    <div className="box" style={{ width: 'min(430px,100%)' }}>{children}</div>
  </div>
);

// Every check of a password or a code happens on the SERVER (/api/admin/login and /api/admin/mfa, with the lockout).
// The browser only keeps the finished session in memory.
async function post(path, token, body) {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });
    return { ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) };
  } catch { return { ok: false, status: 0, d: { error: 'Network problem. Check your connection and try again.' } }; }
}

function SignIn({ onDone, notice }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice || '');
  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    const r = await post('/api/admin/login', null, { email: String(fd.get('email')).trim(), password: String(fd.get('password')) });
    if (!r.ok || !r.d.session) { setErr(r.d.error || 'Could not sign in. Please try again.'); setBusy(false); return; }
    await onDone(r.d.session); setBusy(false);
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

function MfaEnroll({ token, onVerified }) {
  const [f, setF] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    post('/api/admin/mfa', token, { action: 'enroll' }).then((r) => (r.ok ? setF(r.d) : setErr(r.d.error || 'Could not start set-up. Try again.')));
  }, [token]);
  async function verify(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const r = await post('/api/admin/mfa', token, { action: 'verify', factor_id: f.factor_id, code });
    setBusy(false);
    if (!r.ok) { setErr(r.d.error || 'That code is not right.'); return; }
    onVerified(r.d);
  }
  return (
    <Center>
      <h2 style={{ fontSize: 28, marginBottom: 6 }}>Set up two-factor</h2>
      <p className="mut" style={{ marginBottom: 16 }}>Scan the code with an authenticator app, then enter the 6-digit code.</p>
      {f ? (
        <form onSubmit={verify}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}><img src={f.qr_code} alt="Two-factor QR code" width={190} height={190} style={{ display: 'inline-block' }} /></div>
          <p className="sm mut" style={{ textAlign: 'center', marginBottom: 14, wordBreak: 'break-all' }}>Can&apos;t scan? Enter this key: <b>{f.secret}</b></p>
          <div className="fld"><label className="f" htmlFor="c">6-digit code</label><input id="c" className="inp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required /></div>
          {err && <span className="err" style={{ marginBottom: 12 }}>{err}</span>}
          <button className="btn block" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'}</button>
        </form>
      ) : <p className="mut">{err || 'Preparing…'}</p>}
    </Center>
  );
}

function MfaVerify({ token, factorId, onVerified, onCancel }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function verify(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const r = await post('/api/admin/mfa', token, { action: 'verify', factor_id: factorId, code });
    setBusy(false);
    if (!r.ok) { setErr(r.d.error || 'That code is not right.'); return; }
    onVerified(r.d);
  }
  return (
    <Center>
      <h2 style={{ fontSize: 28, marginBottom: 6 }}>Enter your code</h2><p className="mut" style={{ marginBottom: 18 }}>Open your authenticator app and enter the 6-digit code.</p>
      <form onSubmit={verify}>
        <div className="fld"><input className="inp" aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required /></div>
        {err && <span className="err" style={{ marginBottom: 12 }}>{err}</span>}
        <button className="btn block" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
        <button type="button" className="lnk sm" style={{ marginTop: 14 }} onClick={onCancel}>Use a different account</button>
      </form>
    </Center>
  );
}

export default function AdminProvider({ children }) {
  const { store } = useSettings();
  const sb = useMemo(() => supabaseBrowser(), []);
  const [s, setS] = useState({ phase: 'signin' });          // always starts at sign-in: the session is never kept between visits
  const [pending, setPending] = useState(null);             // the password-step tokens, in memory, until the code is checked
  const [msg, setMsg] = useState('');
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const toast = useCallback((m) => { setMsg(m); clearTimeout(window.__thsAdm); window.__thsAdm = setTimeout(() => setMsg(''), 2800); }, []);

  // End the session on the server, then reload so nothing stays in memory.
  const signOut = useCallback(async () => {
    try {
      const t = (await sb?.auth.getSession())?.data.session?.access_token || pending?.access_token;
      if (t) await fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, keepalive: true });
    } catch { /* ignore */ }
    window.location.reload();
  }, [sb, pending]);

  const begin = useCallback(async (session) => {
    const r = await post('/api/admin/mfa', session.access_token, { action: 'status' });
    if (r.status === 403) { setPending(session); return setS({ phase: 'forbidden' }); }
    if (!r.ok) return setS({ phase: 'signin', notice: r.d.error || 'Could not continue. Please sign in again.' });
    setPending(session);
    setS(r.d.next === 'verify' ? { phase: 'mfa-verify', factorId: r.d.factor_id } : { phase: 'mfa-enroll' });
  }, []);

  const finish = useCallback(async (d) => {
    const { error } = await sb.auth.setSession(d.session);
    setPending(null);
    if (error) return setS({ phase: 'signin', notice: 'Could not start your session. Please sign in again.' });
    setS({ phase: 'ready', role: d.role, name: d.name });
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') setS({ phase: 'signin' }); });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (s.phase !== 'ready') return;
    let t;
    const reset = () => { clearTimeout(t); t = setTimeout(signOut, IDLE_MS); };
    const evs = ['click', 'keydown', 'touchstart', 'mousemove'];
    evs.forEach((e) => window.addEventListener(e, reset)); reset();
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [s.phase, signOut]);

  useEffect(() => { setMenu(false); }, [path]);

  if (!sb) return <Center><h2 style={{ fontSize: 26, marginBottom: 8 }}>Not connected</h2><p className="mut">Connect the database (see README, Go live) to use this area.</p></Center>;
  if (s.phase === 'signin') return <SignIn onDone={begin} notice={s.notice} />;
  if (s.phase === 'forbidden') return <Center><h2 style={{ fontSize: 26, marginBottom: 8 }}>No access</h2><p className="mut" style={{ marginBottom: 18 }}>This account is not part of the team.</p><button className="btn ghost" onClick={signOut}>Sign out</button></Center>;
  if (s.phase === 'mfa-enroll') return <MfaEnroll token={pending.access_token} onVerified={finish} />;
  if (s.phase === 'mfa-verify') return <MfaVerify token={pending.access_token} factorId={s.factorId} onVerified={finish} onCancel={signOut} />;

  const token = async () => (await sb.auth.getSession()).data.session?.access_token;
  const active = (p) => (p === '' ? path === ADMIN_BASE || path === ADMIN_BASE + '/' : path.startsWith(ADMIN_BASE + p));
  return (
    <Ctx.Provider value={{ sb, toast, role: s.role, token, base: ADMIN_BASE }}>
      <div className="adm">
        <aside className={`side ${menu ? 'open' : ''}`}>
          <Logo store={store} href={ADMIN_BASE} size={42} label="Team" />
          {NAV.filter((n) => !n[3] || s.role === 'admin').map(([p, label, icon]) => <Link key={label} href={ADMIN_BASE + p} className={active(p) ? 'on' : ''}><Icon n={icon} s={18} />{label}</Link>)}
          <Link href="/" style={{ marginTop: 20, borderTop: '1px solid var(--line)', borderRadius: 0, paddingTop: 18 }}><Icon n="out" s={18} />View storefront</Link>
        </aside>
        <div className="adm-main">
          <div className="adm-top">
            <button className="ib m-only" onClick={() => setMenu(!menu)} aria-label="Menu"><Icon n="menu" /></button>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="av">{String(s.name).slice(0, 2).toUpperCase()}</span>
              <span className="d-only sm"><b>{s.name}</b><br /><span className="mut">{s.role}</span></span>
              <button className="btn ghost s" onClick={signOut}>Sign out</button>
            </div>
          </div>
          <div className="adm-body">{children}</div>
        </div>
      </div>
      <div id="toast" className={msg ? 'show' : ''} role="status" aria-live="polite" style={{ bottom: 30 }}>{msg}</div>
    </Ctx.Provider>
  );
}
