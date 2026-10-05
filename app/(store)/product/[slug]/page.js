import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductGallery from '@/components/ProductGallery';
import ProductBuy from '@/components/ProductBuy';
import ProductGrid from '@/components/ProductGrid';
import Stars from '@/components/Stars';
import { getProductBySlug, getRelated } from '@/lib/catalog.js';
import { getReviews } from '@/lib/reviews.js';
import { CONCERNS } from '@/data/seed-products.js';
import { naira, fmtDate, labelOf } from '@/lib/format.js';
import { getSettings } from '@/lib/settings.js';

export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  return p ? { title: p.name, description: p.shortDescription } : { title: 'Product not found' };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const { delivery } = await getSettings();
  const [rel, reviews] = await Promise.all([getRelated(p), getReviews(p)]);

  const low = p.stock > 0 && p.stock < 5;
  const benefits = [...p.concerns.map((c) => `Targets ${labelOf(CONCERNS, c).toLowerCase()}`), 'Suitable for daily use', 'Authentic, carefully sourced'].slice(0, 4);
  const dist = [5, 4, 3, 2, 1].map((n) => (reviews.length ? Math.round((reviews.filter((r) => r.rating === n).length / reviews.length) * 100) : 0));
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: p.brand },
    description: p.shortDescription, sku: p.sku, ...(p.images?.length ? { image: p.images } : {}),
    offers: { '@type': 'Offer', priceCurrency: 'NGN', price: p.price, availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
    ...(p.reviewCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviewCount } } : {}),
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div className="crumb" style={{ paddingTop: 22 }}><Link href="/">Home</Link> / <Link href={`/shop?cat=${encodeURIComponent(p.category)}`}>{p.category}</Link> / {p.name}</div>
      <div className="pp" style={{ paddingTop: 8 }}>
        <ProductGallery product={p} />
        <div>
          <Link className="brand" href={`/shop?brand=${encodeURIComponent(p.brand)}`} style={{ textDecoration: 'underline' }}>{p.brand}</Link>
          <h1>{p.name}</h1>
          <div className="rt" style={{ fontSize: 14 }}>
            {p.reviewCount ? (<><Stars value={p.rating} /><a href="#reviews">{p.rating} · {p.reviewCount} reviews</a></>) : <a href="#reviews">No reviews yet</a>}
          </div>
          <div className="price" style={{ margin: '16px 0 4px' }}><b>{naira(p.price)}</b>{p.oldPrice > 0 && <><s>{naira(p.oldPrice)}</s><span className="off">-{p.discount}%</span></>}</div>
          <p className="mut" style={{ margin: '8px 0' }}>{p.shortDescription}</p>
          <div className={`stk ${p.stock <= 0 ? 'out' : low ? 'low' : ''}`}><i />{p.stock <= 0 ? 'Out of stock' : low ? `Only ${p.stock} left in stock` : 'In stock'}</div>
          <ProductBuy product={p} />
          <div className="acc">
            <details open><summary>Description</summary><div>{p.description}</div></details>
            <details><summary>Key benefits</summary><ul>{benefits.map((b) => <li key={b}>{b}</li>)}</ul></details>
            {p.howToUse && <details><summary>How to use</summary><div>{p.howToUse}</div></details>}
            {p.ingredients && <details><summary>Ingredients</summary><div>{p.ingredients}</div></details>}
            <details><summary>Who it&apos;s for</summary><div>{p.skinType || 'Everyone'}{p.concerns.length ? `. Especially helpful for ${p.concerns.map((c) => labelOf(CONCERNS, c).toLowerCase()).join(', ')}.` : '.'}</div></details>
            <details><summary>Shipping information</summary><div>Lagos: {delivery.lagosDays} ({naira(delivery.lagosFee)}, free over {naira(delivery.freeThreshold)}). Other states: {delivery.otherDays} ({naira(delivery.otherFee)}). <Link className="lnk" href="/delivery">Delivery details</Link></div></details>
            <details><summary>Returns</summary><div>Unopened products can be returned within {delivery.returnDays} days of delivery. Damaged or incorrect items are replaced at no cost. Message us on WhatsApp with a photo.</div></details>
          </div>
        </div>
      </div>

      <section id="reviews" style={{ padding: '40px 0' }}>
        <h2 style={{ marginBottom: 28 }}>Reviews</h2>
        {p.reviewCount ? (
          <div className="rv-box">
            <div>
              <div className="big">{p.rating}</div><Stars value={p.rating} />
              <p className="mut sm" style={{ margin: '6px 0 16px' }}>Based on {p.reviewCount} reviews</p>
              {[5, 4, 3, 2, 1].map((n, i) => <div key={n} className="dist"><span style={{ width: 26 }}>{n} ★</span><div className="tr"><i style={{ width: `${dist[i]}%` }} /></div><span style={{ width: 34, textAlign: 'right' }} className="mut">{dist[i]}%</span></div>)}
            </div>
            <div>
              {reviews.map((r) => (
                <div key={r.id} className="rev">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><b>{r.name}</b><span className="mut sm">{fmtDate(r.date)}</span></div>
                  <div className="rt" style={{ margin: '4px 0' }}><Stars value={r.rating} /></div>
                  <p>{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : <p className="mut">No reviews yet. Bought this? Tell us what you think on WhatsApp and we&apos;ll add it.</p>}
      </section>

      {rel.length > 0 && <section style={{ padding: '20px 0 70px' }}><h2 style={{ marginBottom: 28 }}>You may also like</h2><ProductGrid items={rel} /></section>}
    </div>
  );
}
