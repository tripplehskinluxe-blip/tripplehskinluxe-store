'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCart } from './CartProvider';

export default function Newsletter() {
  const { toast } = useCart();
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      const r = await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fd.get('email'), website: fd.get('website') }) });
      toast(r.ok ? "You're subscribed. Thank you!" : 'Please check your email address');
      if (r.ok) form.reset();
    } catch { toast('Something went wrong. Please try again.'); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit}>
      <input className="inp" type="email" name="email" placeholder="Enter your email" required aria-label="Email" />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true" />
      <button className="btn" disabled={busy}>Subscribe</button>
      <p style={{ fontSize: 12, opacity: 0.75, margin: '10px 0 0' }}>By subscribing you agree to our <Link href="/privacy" style={{ textDecoration: 'underline' }}>Privacy Policy</Link>.</p>
    </form>
  );
}
