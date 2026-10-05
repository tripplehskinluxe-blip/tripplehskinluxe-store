'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { useCart } from '@/components/CartProvider';
import { useSettings } from '@/components/SettingsProvider';

export default function Contact() {
  const { store, waLink } = useSettings();
  const { toast } = useCart();
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast("Message sent. We'll reply soon."); form.reset(); } else toast(d.error || 'Please check the form and try again');
    } catch { toast('Network error. Please try again.'); }
    setBusy(false);
  }

  return (
    <>
      <div className="ph"><div className="container"><h1>Contact us</h1><p>We usually reply within a few hours.</p></div></div>
      <div className="container" style={{ padding: '44px 20px 90px' }}>
        <div className="cols">
          <div>
            {[['phone', 'Phone', store.phone], ['mail', 'Email', store.email], ['chat', 'WhatsApp', store.phone], ['pin', 'Store address', store.address], ['clock', 'Opening hours', store.hours]].map(([i, t, v]) => (
              <div className="info" key={t}><span className="ico"><Icon n={i} s={18} /></span><div><b>{t}</b><br /><span className="mut">{v}</span></div></div>
            ))}
            <a className="btn" style={{ marginTop: 22 }} target="_blank" rel="noopener noreferrer" href={waLink()}>Chat on WhatsApp</a>
          </div>
          <form className="box" onSubmit={submit}>
            <h3 style={{ marginBottom: 18 }}>Send a message</h3>
            <div className="row2">
              <div className="fld"><label className="f" htmlFor="first">First name</label><input className="inp" id="first" name="first" required maxLength={60} /></div>
              <div className="fld"><label className="f" htmlFor="last">Last name</label><input className="inp" id="last" name="last" required maxLength={60} /></div>
            </div>
            <div className="fld"><label className="f" htmlFor="email">Email</label><input className="inp" id="email" type="email" name="email" required maxLength={120} /></div>
            <div className="fld"><label className="f" htmlFor="phone">Phone</label><input className="inp" id="phone" type="tel" name="phone" maxLength={25} /></div>
            <div className="fld"><label className="f" htmlFor="message">Message</label><textarea className="inp" id="message" rows={5} name="message" required maxLength={3000} /></div>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true" />
            <button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
          </form>
        </div>
      </div>
    </>
  );
}
