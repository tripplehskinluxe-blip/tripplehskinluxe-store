import Link from 'next/link';
import { Suspense } from 'react';
import ProductGrid from '@/components/ProductGrid';
import ShopFilters, { SortSelect } from '@/components/ShopFilters';
import Pagination from '@/components/Pagination';
import Icon from '@/components/Icon';
import { getProducts, getCategories, getBrands } from '@/lib/catalog.js';
import { CONCERNS } from '@/data/seed-products.js';
import { buildQuery } from '@/lib/format.js';

export const metadata = { title: 'Shop' };
const FLAGS = { new: 'New arrivals', best: 'Best sellers', sale: 'On offer' };
const SORTS = ['featured', 'newest', 'best', 'plh', 'phl', 'rated'];
const str = (v) => (typeof v === 'string' ? v.slice(0, 60) : '');

export default async function Shop({ searchParams }) {
  const sp = await searchParams;
  const o = {
    q: str(sp.q), cat: str(sp.cat), brand: str(sp.brand), concern: typeof sp.concern === 'string' && Object.hasOwn(CONCERNS, sp.concern) ? sp.concern : '',
    flag: typeof sp.flag === 'string' && Object.hasOwn(FLAGS, sp.flag) ? sp.flag : '', sort: SORTS.includes(sp.sort) ? sp.sort : '',
    price: /^\d*-\d*$/.test(str(sp.price)) ? sp.price : '', rating: ['4', '4.5'].includes(sp.rating) ? sp.rating : '',
    avail: ['in', 'out'].includes(sp.avail) ? sp.avail : '', page: /^\d{1,3}$/.test(str(sp.page)) ? sp.page : '',
  };
  const [{ items, total, page, pageSize }, categories, brands] = await Promise.all([getProducts(o), getCategories(), getBrands()]);

  const { page: _p, ...base } = o;
  const chips = [
    o.flag && ['flag', FLAGS[o.flag]], o.cat && ['cat', o.cat], o.brand && ['brand', o.brand], o.concern && ['concern', CONCERNS[o.concern]],
    o.q && ['q', `“${o.q}”`], o.price && ['price', 'Price filter'], o.rating && ['rating', `${o.rating}★+`], o.avail && ['avail', o.avail === 'in' ? 'In stock' : 'Out of stock'],
  ].filter(Boolean);
  const title = o.flag ? FLAGS[o.flag] : o.cat || 'Shop all';

  return (
    <>
      <div className="ph"><div className="container">
        <div className="crumb"><Link href="/">Home</Link> / Shop</div>
        <h1>{title}</h1><p>Explore our complete beauty and wellness collection.</p>
      </div></div>
      <div className="container">
        <div className="shop">
          <Suspense fallback={null}><ShopFilters categories={categories} brands={brands} concerns={CONCERNS} /></Suspense>
          <div>
            <div className="bar">
              <span className="mut">{o.q ? `${total} result${total === 1 ? '' : 's'} for “${o.q}”` : `${total} product${total === 1 ? '' : 's'}`}</span>
              <div className="d-sort" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="sm mut">Sort</span><Suspense fallback={null}><SortSelect /></Suspense></div>
            </div>
            {chips.length > 0 && (
              <div className="chips">{chips.map(([k, label]) => <Link key={k} className="chip" href={`/shop${buildQuery(base, { [k]: '' })}`}>{label} <Icon n="x" s={13} /></Link>)}</div>
            )}
            {items.length ? <ProductGrid items={items} /> : (
              <div className="empty"><h3>No products found</h3><p>Try changing or clearing your filters.</p><Link className="btn" href="/shop">Clear filters</Link></div>
            )}
            <Pagination page={page} total={total} pageSize={pageSize} params={base} />
          </div>
        </div>
      </div>
    </>
  );
}
