'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import ProductArt from './ProductArt';
import { naira } from '@/lib/format.js';

export default function SearchOverlay({ onClose }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ items: [], total: 0 });
  const [recent, setRecent] = useState([]);
  const router = useRouter();
  const inp = useRef(null);

  useEffect(() => {
    inp.current?.focus();
    try { setRecent(JSON.parse(localStorage.getItem('ths_recent') || '[]')); } catch {}
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    const t = q.trim();
    if (!t) { setRes({ items: [], total: 0 }); return; }
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch('/api/search?q=' + encodeURIComponent(t), { signal: ctl.signal }).then((r) => r.json()).then(setRes).catch(() => {});
    }, 250);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

  const go = (term) => {
    const t = term.trim();
    if (!t) return;
    const r = [t, ...recent.filter((x) => x !== t)].slice(0, 6);
    localStorage.setItem('ths_recent', JSON.stringify(r));
    onClose();
    router.push('/shop?q=' + encodeURIComponent(t));
  };

  const t = q.trim();
  return (
    <div className="so" role="dialog" aria-label="Search">
      <div className="so-in">
        <form className="so-top" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <Icon n="search" s={26} />
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What are you looking for?" autoComplete="off" aria-label="Search" />
          <button type="button" className="ib" onClick={onClose} aria-label="Close search"><Icon n="x" s={24} /></button>
        </form>
        {!t ? (
          <>
            <p className="mut sm" style={{ margin: '22px 0 10px' }}>{recent.length ? 'Recent searches' : 'Popular searches'}</p>
            <div className="chips">
              {(recent.length ? recent : ['serum', 'sunscreen', 'shea butter', 'massage oil', 'body mist']).map((x) => (
                <button key={x} className="chip" onClick={() => go(x)}>{x}</button>
              ))}
            </div>
            {recent.length > 0 && <button className="lnk sm" onClick={() => { localStorage.removeItem('ths_recent'); setRecent([]); }}>Clear recent searches</button>}
          </>
        ) : (
          <>
            <p style={{ margin: '20px 0 6px', fontWeight: 600 }}>{res.total} result{res.total === 1 ? '' : 's'} for “{t}”</p>
            {res.items.map((p) => (
              <Link key={p.id} href={`/product/${p.slug}`} className="sres" onClick={onClose}>
                <div className="media"><ProductArt product={p} /></div>
                <div style={{ flex: 1 }}><span className="brand">{p.brand}</span><br /><b style={{ fontWeight: 500 }}>{p.name}</b></div>
                <b>{naira(p.price)}</b>
              </Link>
            ))}
            {res.total > res.items.length && <button className="btn block" style={{ marginTop: 18 }} onClick={() => go(q)}>See all {res.total} results</button>}
            {res.total === 0 && <p className="mut" style={{ marginTop: 14 }}>Try a product name, brand or a concern like “dry skin”.</p>}
          </>
        )}
      </div>
    </div>
  );
}
