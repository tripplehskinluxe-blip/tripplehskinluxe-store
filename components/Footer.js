import Link from 'next/link';
import { socialLabel } from '@/lib/settings-core.js';
import { getSettings } from '@/lib/settings.js';
import { logoParts } from '@/lib/format.js';

export default async function Footer() {
  const { store } = await getSettings();
  const [top, sub] = logoParts(store.name);
  const socials = Object.entries(store.social).filter(([, url]) => url);
  return (
    <footer className="ft">
      <div className="container">
        <div className="ft-g">
          <div>
            <Link className="logo" href="/">{top}<small>{sub}</small></Link>
            <p style={{ margin: '16px 0', maxWidth: '34ch', fontSize: 14 }}>{store.tagline} Skincare, body care, hair care, fragrance and spa essentials, delivered across Nigeria.</p>
            <div style={{ display: 'flex', gap: 16, fontSize: 14, flexWrap: 'wrap' }}>
              {socials.map(([k, url]) => <a key={k} href={url} target="_blank" rel="noopener noreferrer">{socialLabel[k]}</a>)}
            </div>
          </div>
          <div>
            <h5>Shop</h5>
            <Link href="/shop">All products</Link><Link href="/spa">Spa &amp; Wellness</Link><Link href="/shop?flag=new">New arrivals</Link>
            <Link href="/shop?flag=best">Best sellers</Link><Link href="/offers">Offers</Link><Link href="/brands">Brands</Link>
          </div>
          <div>
            <h5>Help</h5>
            <Link href="/track-order">Track order</Link><Link href="/delivery">Delivery</Link><Link href="/faq">FAQ</Link><Link href="/returns">Returns</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
            <Link href="/contact">Contact</Link><Link href="/about">About us</Link><Link href="/ceo">Meet the CEO</Link>
          </div>
          <div>
            <h5>Visit us</h5>
            <p style={{ fontSize: 14 }}>{store.address}</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>{store.hours}</p>
          </div>
        </div>
        <div className="ft-b"><span>© {new Date().getFullYear()} {store.name}</span><span>Prices in Nigerian Naira (₦)</span></div>
      </div>
    </footer>
  );
}
