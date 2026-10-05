'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import SearchOverlay from './SearchOverlay';
import { useCart } from './CartProvider';
import { useSettings } from './SettingsProvider';
import { logoParts } from '@/lib/format.js';

export default function Header({ categories }) {
  const { count, wish, ready } = useCart();
  const { store, announcement } = useSettings();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const path = usePathname();
  const [top, sub] = logoParts(store.name);

  useEffect(() => { setMenu(false); setSearch(false); }, [path]);
  useEffect(() => { document.body.classList.toggle('lock', menu || search); }, [menu, search]);

  const enc = encodeURIComponent;
  return (
    <>
      {announcement && <div className="ann">{announcement}</div>}
      <header className="hdr">
        <div className="container hdr-in">
          <button className="ib m-only" onClick={() => setMenu(true)} aria-label="Open menu"><Icon n="menu" /></button>
          <Link className="logo" href="/">{top}<small>{sub}</small></Link>
          <nav className="nav" aria-label="Main">
            <Link href="/shop">Shop</Link>
            <div className="dd">
              <Link href="/shop">Categories</Link>
              <div className="dd-m">{categories.map((c) => <Link key={c.name} href={`/shop?cat=${enc(c.name)}`}>{c.name}</Link>)}</div>
            </div>
            <Link href="/spa">Spa &amp; Wellness</Link>
            <Link href="/brands">Brands</Link>
            <Link href="/shop?flag=new">New Arrivals</Link>
            <Link href="/shop?flag=best">Best Sellers</Link>
            <Link href="/offers">Offers</Link>
          </nav>
          <div className="hdr-r">
            <button className="ib" onClick={() => setSearch(true)} aria-label="Search"><Icon n="search" /></button>
            <Link className="ib d-only" href="/wishlist" aria-label="Wishlist"><Icon n="heart" />{ready && wish.length > 0 && <span className="cnt">{wish.length}</span>}</Link>
            <Link className="ib" href="/cart" aria-label="Bag"><Icon n="bag" />{ready && count > 0 && <span className="cnt">{count}</span>}</Link>
          </div>
        </div>
      </header>
      {search && <SearchOverlay onClose={() => setSearch(false)} />}
      {menu && (
        <>
          <div className="bg" onClick={() => setMenu(false)} />
          <div className="drw">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Link className="logo" href="/" style={{ margin: 0 }}>{top}<small>{sub}</small></Link>
              <button className="ib" onClick={() => setMenu(false)} aria-label="Close"><Icon n="x" /></button>
            </div>
            <Link href="/shop">Shop</Link>
            <div className="sub">{categories.map((c) => <Link key={c.name} href={`/shop?cat=${enc(c.name)}`}>{c.name}</Link>)}</div>
            <Link href="/spa">Spa &amp; Wellness</Link>
            <Link href="/brands">Brands</Link>
            <Link href="/shop?flag=new">New Arrivals</Link>
            <Link href="/shop?flag=best">Best Sellers</Link>
            <Link href="/offers">Offers</Link>
            <Link href="/ceo">Meet the CEO</Link>
            <Link href="/track-order">Track order</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/about">About</Link>
            <Link href="/faq">FAQ</Link>
          </div>
        </>
      )}
    </>
  );
}
