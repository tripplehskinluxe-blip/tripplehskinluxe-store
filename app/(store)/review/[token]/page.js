'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const STAR_LABEL = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function Stars({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}, ${STAR_LABEL[n]}`}
          onClick={() => onChange(n)} className="star-btn" style={{ fontSize: 30, lineHeight: 1, color: n <= value ? 'var(--p)' : 'var(--line)' }}>★</button>
      ))}
    </div>
  );
}

function ProductRow({ token, item, onDone }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!rating) { setErr('Please choose a star rating.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, product_id: item.product_id, rating, name, body }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { onDone(item.product_id); setOpen(false); }
      else setErr(d.error || 'Something went wrong. Please try again.');
    } catch { setErr('Network error. Please try again.'); }
    setBusy(false);
  }

  if (item.reviewed) return <div className="box" style={{ marginBottom: 14 }}><b>{item.name}</b><p className="sm mut" style={{ marginTop: 4 }}>✓ You have reviewed this.</p></div>;
  return (
    <div className="box" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <b>{item.name}</b>
        {!open && <button className="btn s" onClick={() => setOpen(true)}>Write a review</button>}
      </div>
      {open && (
        <form onSubmit={submit} style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <Stars value={rating} onChange={setRating} />
          <input className="inp" placeholder="Your name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />
          <textarea className="inp" placeholder="What did you think? (optional)" maxLength={1000} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          {err && <span className="err">{err}</span>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn s" disabled={busy}>{busy ? 'Posting…' : 'Post review'}</button>
            <button type="button" className="btn ghost s" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ReviewPage() {
  const { token } = useParams();
  const [state, setState] = useState({ phase: 'loading' });

  useEffect(() => {
    let live = true;
    fetch(`/api/review?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (live) setState(ok ? { phase: 'ready', ...d } : { phase: 'invalid' }); })
      .catch(() => { if (live) setState({ phase: 'invalid' }); });
    return () => { live = false; };
  }, [token]);

  const markReviewed = (productId) => setState((s) => ({ ...s, items: s.items.map((i) => (i.product_id === productId ? { ...i, reviewed: true } : i)) }));

  return (
    <div className="container" style={{ maxWidth: 640, padding: '48px 20px 90px' }}>
      <h1 style={{ marginBottom: 8 }}>Review your order</h1>
      {state.phase === 'loading' && <p className="mut">Loading…</p>}
      {state.phase === 'invalid' && (
        <div className="alert" style={{ display: 'block' }}>
          This review link is no longer valid, or has expired. If you would like to leave a review, please message us on WhatsApp with your order number.
        </div>
      )}
      {state.phase === 'ready' && (
        <>
          <p className="mut" style={{ marginBottom: 28 }}>Hi {state.first_name}, thanks for shopping with us. Tell us what you thought of what you ordered ({state.order_number}).</p>
          {state.items.map((item) => <ProductRow key={item.product_id} token={token} item={item} onDone={markReviewed} />)}
          {state.items.every((i) => i.reviewed) && <p className="mut" style={{ marginTop: 8 }}>You have reviewed everything in this order. Thank you!</p>}
          <p className="sm mut" style={{ marginTop: 28 }}><Link href="/">Back to the shop</Link></p>
        </>
      )}
    </div>
  );
}
