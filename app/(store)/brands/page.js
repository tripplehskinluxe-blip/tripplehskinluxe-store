import Link from 'next/link';
import { getBrands } from '@/lib/catalog.js';

export const metadata = { title: 'Brands' };
export const revalidate = 300;

export default async function Brands() {
  const brands = await getBrands();
  const groups = {};
  brands.forEach((b) => { (groups[b.name[0].toUpperCase()] ||= []).push(b); });
  return (
    <>
      <div className="ph"><div className="container"><h1>Brands</h1><p>Every brand we stock, A to Z.</p></div></div>
      <div className="container" style={{ padding: '40px 20px 90px' }}>
        <div className="brands">
          {Object.keys(groups).sort().map((k) => (
            <section key={k}><h3>{k}</h3>
              {groups[k].map((b) => <Link key={b.name} href={`/shop?brand=${encodeURIComponent(b.name)}`}><span>{b.name}</span><span className="mut sm">{b.count} products</span></Link>)}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
