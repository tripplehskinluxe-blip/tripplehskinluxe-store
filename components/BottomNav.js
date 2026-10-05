'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { useCart } from './CartProvider';

export default function BottomNav() {
  const path = usePathname();
  const { count, wish, ready } = useCart();
  const items = [
    ['/', 'Home', 'home'], ['/shop', 'Shop', 'grid'], ['/spa', 'Spa', 'drop'], ['/wishlist', 'Wishlist', 'heart'], ['/cart', 'Bag', 'bag'],
  ];
  const on = (h) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <nav className="bnav" aria-label="Quick navigation">
      {items.map(([href, label, icon]) => (
        <Link key={href} href={href} className={on(href) ? 'on' : ''}>
          <Icon n={icon} s={22} />{label}
          {ready && href === '/wishlist' && wish.length > 0 && <span className="cnt">{wish.length}</span>}
          {ready && href === '/cart' && count > 0 && <span className="cnt">{count}</span>}
        </Link>
      ))}
    </nav>
  );
}
