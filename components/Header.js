'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import SearchOverlay from './SearchOverlay';
import { useCart } from './CartProvider';
import { useSettings } from './SettingsProvider';
import Logo from './Logo';

export default function Header({ categories }) {
  const { count, wish, ready } = useCart();
  const { store, announcement } = useSettings();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const path = usePathname();

  useEffect(() => { setMenu(false); setSearch(false); }, [path]);
  useEffect(() => { document.body.classList.toggle('lock', menu || search); }, [menu, search]);
  useEffect(() => {
    if (!menu) return;
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu]);

  const enc = encodeURIComponent;
  const links = [
    ['/shop', 'Shop', true], ['/spa', 'Spa & Wellness'], ['/brands', 'Brands'], ['/shop?flag=new', 'New Arrivals'],
    ['/shop?flag=best', 'Best Sellers'], ['/offers', 'Offers'], ['/ceo', 'Meet the CEO'], ['/track-order', 'Track order'],
    ['/contact', 'Contact'], ['/about', 'About'], ['/faq', 'FAQ'],
  ];
  return (
    <>
      {announcement && <div className="ann">{announcement}</div>}
      <header className="hdr">
        <div className="container hdr-in">
          <button className="ib m-only" onClick={() => setMenu(true)} aria-label="Open menu"><Icon n="menu" /></button>
          <Logo store={store} />
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
      <div className={`bg${menu ? ' open' : ''}`} onClick={() => setMenu(false)} aria-hidden="true" />
      <aside className={`drw${menu ? ' open' : ''}`} aria-hidden={!menu} aria-label="Menu">
        <div className="drw-top">
          <Logo store={store} size={36} />
          <button className="ib" onClick={() => setMenu(false)} aria-label="Close menu" tabIndex={menu ? 0 : -1}><Icon n="x" /></button>
        </div>
        {links.map(([href, label, sub], i) => (
          <div key={href + label} style={{ '--i': i }} className="drw-i">
            <Link href={href} tabIndex={menu ? 0 : -1}>{label}</Link>
            {sub && <div className="sub">{categories.map((c) => <Link key={c.name} href={`/shop?cat=${enc(c.name)}`} tabIndex={menu ? 0 : -1}>{c.name}</Link>)}</div>}
          </div>
        ))}
      </aside>
    </>
  );
}
