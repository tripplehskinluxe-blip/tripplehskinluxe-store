'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';

const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['best', 'Best selling'], ['plh', 'Price: Low to High'], ['phl', 'Price: High to Low'], ['rated', 'Highest Rated']];
const PRICES = [['', 'Any price'], ['0-10000', 'Under ₦10,000'], ['10000-20000', '₦10,000 – ₦20,000'], ['20000-30000', '₦20,000 – ₦30,000'], ['30000-', '₦30,000 and above']];

function useSetParam() {
  const router = useRouter();
  const sp = useSearchParams();
  return (k, v) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    p.delete('page');
    router.push('/shop' + (p.toString() ? '?' + p.toString() : ''));
  };
}

export function SortSelect() {
  const sp = useSearchParams();
  const set = useSetParam();
  return (
    <select className="sel" style={{ width: 'auto' }} value={sp.get('sort') || 'featured'} onChange={(e) => set('sort', e.target.value === 'featured' ? '' : e.target.value)} aria-label="Sort">
      {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default function ShopFilters({ categories, brands, concerns }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = useSetParam();
  const [open, setOpen] = useState(false);
  const get = (k) => sp.get(k) || '';

  return (
    <>
      <button className="btn ghost s only-m" onClick={() => setOpen(true)} style={{ justifySelf: 'start' }}><Icon n="filter" s={16} /> Filter &amp; sort</button>
      {open && <div className="bg" style={{ zIndex: 94 }} onClick={() => setOpen(false)} />}
      <aside className={`flt ${open ? 'open' : ''}`}>
        <h4>Filter &amp; sort <button className="only-m" onClick={() => setOpen(false)} aria-label="Close"><Icon n="x" /></button></h4>
        <form className="fld" key={get('q')} onSubmit={(e) => { e.preventDefault(); set('q', new FormData(e.currentTarget).get('q').toString().trim()); }}>
          <label className="f" htmlFor="fq">Search products</label>
          <input id="fq" name="q" className="inp" type="search" placeholder="Serum, SPF, shea… then press enter" defaultValue={get('q')} />
        </form>
        <div className="fld only-m"><label className="f">Sort by</label>
          <select className="sel" value={get('sort') || 'featured'} onChange={(e) => set('sort', e.target.value === 'featured' ? '' : e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label className="f">Category</label>
          <select className="sel" value={get('cat')} onChange={(e) => set('cat', e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
        <div className="fld"><label className="f">Brand</label>
          <select className="sel" value={get('brand')} onChange={(e) => set('brand', e.target.value)}><option value="">All brands</option>{brands.map((b) => <option key={b.name}>{b.name}</option>)}</select></div>
        <div className="fld"><label className="f">Price</label>
          <select className="sel" value={get('price')} onChange={(e) => set('price', e.target.value)}>{PRICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label className="f">Rating</label>
          <select className="sel" value={get('rating')} onChange={(e) => set('rating', e.target.value)}><option value="">Any rating</option><option value="4">4★ and above</option><option value="4.5">4.5★ and above</option></select></div>
        <div className="fld"><label className="f">Availability</label>
          <select className="sel" value={get('avail')} onChange={(e) => set('avail', e.target.value)}><option value="">All</option><option value="in">In stock</option><option value="out">Out of stock</option></select></div>
        <div className="fld"><label className="f">Skin concern</label>
          <select className="sel" value={get('concern')} onChange={(e) => set('concern', e.target.value)}><option value="">All concerns</option>{Object.entries(concerns).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost block" onClick={() => { setOpen(false); router.push('/shop'); }}>Clear all</button>
          <button className="btn block only-m" onClick={() => setOpen(false)}>Show results</button>
        </div>
      </aside>
    </>
  );
}
