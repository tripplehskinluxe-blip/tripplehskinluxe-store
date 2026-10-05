import Link from 'next/link';
import ProductGrid from '@/components/ProductGrid';
import { getProducts } from '@/lib/catalog.js';

export const metadata = { title: 'Offers' };
export const revalidate = 60;

export default async function Offers() {
  const { items, total } = await getProducts({ flag: 'sale', pageSize: 48 });
  return (
    <>
      <div className="ph"><div className="container"><h1>Beauty deals worth discovering.</h1><p>{total} products on offer right now.</p></div></div>
      <div className="container" style={{ padding: '36px 20px 90px' }}>
        {items.length ? <ProductGrid items={items} /> : <div className="empty"><h3>No offers right now</h3><p>Check back soon, or browse the full collection.</p><Link className="btn" href="/shop">Shop all</Link></div>}
      </div>
    </>
  );
}
