'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import { fmtDate } from '@/lib/format.js';

// A password the admin can hand over: 16 characters from a set without look-alike letters, drawn with the browser's secure random source.
const SET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%*+-=?';
function randomIndex(n) {
  const limit = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);        // reject values that would bias the result
  return buf[0] % n;
}
const generate = () => Array.from({ length: 16 }, () => SET[randomIndex(SET.length)]).join('');

function PasswordField({ id, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="fld">
      <label className="f" htmlFor={id}>Password (at least 12 characters)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id={id} className="inp" style={{ flex: '1 1 220px' }} type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn ghost s" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
        <button type="button" className="btn ghost s" onClick={() => { onChange(generate()); setShow(true); }}>Generate</button>
      </div>
    </div>
  );
}

function Inner() {
  const { sb, toast, token, base } = useAdmin();
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [card, setCard] = useState(null);          // the login details just created, shown once so they can be handed over
  const [resetFor, setResetFor] = useState(null);  // staff id whose password is being reset
  const [resetPw, setResetPw] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('team_list');
    if (error) { toast('Could not load the team'); setRows([]); return; }
    setRows(data || []);
  }, [sb, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { setPw(''); setResetPw(''); }, []);

  async function call(body) {
    const r = await fetch('/api/admin/team', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d };
  }

  async function add(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const password = pw, em = email.trim();
    const { ok, d } = await call({ action: 'create', email: em, password });
    setBusy(false);
    if (!ok) { setErr(d.error || 'Could not create the account.'); return; }
    setCard({ email: d.email, password, kind: 'new' }); setEmail(''); setPw(''); load();
  }

  async function doReset(row) {
    setBusy(true); setErr('');
    const password = resetPw;
    const { ok, d } = await call({ action: 'reset_password', user_id: row.id, email: row.email, password });
    setBusy(false);
    if (!ok) { setErr(d.error || 'Could not reset the password.'); return; }
    setCard({ email: row.email, password, kind: 'reset' }); setResetFor(null); setResetPw('');
  }

  async function resetMfa(row) {
    if (!confirm(`Reset the authenticator for ${row.email}? They will scan a new QR code the next time they sign in.`)) return;
    setErr(''); const { ok, d } = await call({ action: 'reset_mfa', user_id: row.id });
    toast(ok ? 'Authenticator reset. They set it up again at their next sign-in.' : d.error || 'Could not reset');
  }

  async function remove(row) {
    if (!confirm(`Remove ${row.email}? They will no longer be able to sign in.`)) return;
    setErr(''); const { ok, d } = await call({ action: 'remove', user_id: row.id });
    if (!ok) { toast(d.error || 'Could not remove'); return; }
    toast(d.warning || 'Removed'); load();
  }

  const address = typeof window !== 'undefined' ? `${window.location.origin}${base}` : base;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Select the text and copy it by hand'));

  return (
    <>
      <PageHead title="Team" sub="Add the people who work in the shop. Staff can use Orders, In-store sales, Inventory and Customers, and nothing else." />

      {card && (
        <div className="pnl" style={{ borderLeft: '4px solid #2e9d62', marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>{card.kind === 'new' ? 'Account created' : 'Password changed'}: give them these</h3>
          <p className="sm mut" style={{ margin: '0 0 10px' }}>Copy the password now. It is not shown again once you close this box.</p>
          <p style={{ margin: '4px 0' }}><b>Team address:</b> {address} <button className="btn ghost s" onClick={() => copy(address)}>Copy</button></p>
          <p style={{ margin: '4px 0' }}><b>Email:</b> {card.email}</p>
          <p style={{ margin: '4px 0' }}><b>Password:</b> <code>{card.password}</code> <button className="btn ghost s" onClick={() => copy(card.password)}>Copy</button></p>
          <p className="sm mut" style={{ margin: '10px 0' }}>{card.kind === 'new' ? 'On their first sign-in they scan a QR code with an authenticator app on their OWN phone.' : 'Their existing sessions may stay open until they expire. If someone has left, use Remove instead.'}</p>
          <button className="btn s" onClick={() => setCard(null)}>I have copied it, close</button>
        </div>
      )}

      <div className="pnl" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>Add a staff member</h3>
        <form onSubmit={add}>
          <div className="fld"><label className="f" htmlFor="tm_email">Their email</label><input id="tm_email" className="inp" type="email" autoComplete="off" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <PasswordField id="tm_pw" value={pw} onChange={setPw} />
          {err && <span className="err" style={{ display: 'block', margin: '8px 0' }}>{err}</span>}
          <button className="btn" disabled={busy || !email || !pw}>{busy ? 'Please wait…' : 'Create staff account'}</button>
        </form>
        <p className="sm mut" style={{ marginTop: 12 }}>This only creates STAFF. Nobody can be made an admin from here.</p>
      </div>

      <div className="pnl">
        <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>Current team</h3>
        {!rows ? <p className="mut">Loading…</p> : (
          <div className="tw"><table className="t"><thead><tr><th>Email</th><th>Role</th><th>Last sign-in</th><th /></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{r.role === 'admin' ? 'Admin' : 'Staff'}</td>
                <td>{r.last_sign_in_at ? fmtDate(r.last_sign_in_at) : 'Never'}</td>
                <td style={{ textAlign: 'right' }}>
                  {r.role === 'admin' ? <span className="sm mut">Managed in Supabase</span> : resetFor === r.id ? (
                    <div style={{ textAlign: 'left', minWidth: 260 }}>
                      <PasswordField id={`rp_${r.id}`} value={resetPw} onChange={setResetPw} />
                      <div style={{ display: 'flex', gap: 8 }}><button className="btn s" disabled={busy || !resetPw} onClick={() => doReset(r)}>Set password</button><button className="btn ghost s" onClick={() => { setResetFor(null); setResetPw(''); setErr(''); }}>Cancel</button></div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn ghost s" onClick={() => { setResetFor(r.id); setResetPw(''); setErr(''); }}>Reset password</button>
                      <button className="btn ghost s" onClick={() => resetMfa(r)}>Reset authenticator</button>
                      <button className="btn danger s" onClick={() => remove(r)}>Remove</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="mut">No team members yet.</td></tr>}
          </tbody></table></div>
        )}
        {resetFor && err && <span className="err" style={{ display: 'block', margin: '8px 0' }}>{err}</span>}
        <p className="sm mut" style={{ marginTop: 12 }}>Never share an admin login with staff: they would get access to everything. Admins are added or changed only in Supabase.</p>
      </div>
    </>
  );
}
export default function TeamPage() { return <AdminOnly><Inner /></AdminOnly>; }
