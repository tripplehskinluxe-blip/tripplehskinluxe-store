import Link from 'next/link';
import ProductArt from '@/components/ProductArt';
import ProductGrid from '@/components/ProductGrid';
import Newsletter from '@/components/Newsletter';
import Icon from '@/components/Icon';
import { getHome, getCategories } from '@/lib/catalog.js';
import { CONCERNS } from '@/data/seed-products.js';
import { getSettings } from '@/lib/settings.js';
import { art } from '@/lib/art.js';
import { naira } from '@/lib/format.js';

export const revalidate = 60;

const CONCERN_DESC = { acne: 'Clear, calm, balanced', dry: 'Deep, lasting hydration', darkspots: 'Even out your tone', pigment: 'Brighter, smoother skin', sensitive: 'Gentle, barrier-first care', glow: 'Lit-from-within skin' };
const ph = { id: 'ph', slug: 'ph', category: 'Skincare', subcategory: '', name: '', brand: '' };

export default async function Home() {
  const { store, delivery } = await getSettings();
  const [{ best, fresh }, cats] = await Promise.all([getHome(), getCategories()]);
  const [a, b, c] = [best[1] || best[0] || ph, fresh[0] || best[0] || ph, best[4] || best[0] || ph];
  const mq = ['Authentic products', `Free Lagos delivery over ${naira(delivery.freeThreshold)}`, 'Pay securely with Paystack', `Visit us: ${store.address}`, 'Chat with us on WhatsApp'];
  const marquee = [...mq, ...mq];
  const spaPick = [best, fresh].flat().filter((p) => p.category === 'Spa & Wellness');

  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div className="hero-copy">
            <h1>{store.tagline}</h1>
            <p>Discover skincare, body care, hair care, fragrance and spa essentials carefully selected for your everyday routine.</p>
            <div className="bt"><Link className="btn" href="/shop">Shop now</Link><Link className="btn ghost" href="/shop?flag=best">Explore best sellers</Link></div>
          </div>
          <div className="collage">
            <div className="cc a"><ProductArt product={a} variant={0} /></div>
            <div className="cc b"><ProductArt product={b} variant={1} /></div>
            <div className="cc c"><ProductArt product={c} variant={2} /></div>
          </div>
        </div>
      </section>
      <div className="mq" aria-hidden="true"><div>{marquee.map((t, i) => <span key={i}>{t}</span>)}</div></div>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Shop by category</h2><p>Find what your routine is missing.</p></div></div>
        <div className="grid g3">
          {cats.map((cat) => (
            <Link key={cat.name} className="cat" href={`/shop?cat=${encodeURIComponent(cat.name)}`}>
              <div className="media"><div className="art" dangerouslySetInnerHTML={{ __html: art({ id: cat.name, slug: cat.slug, category: cat.name, subcategory: '', name: '', brand: '' }, cat.name.length % 4) }} /></div>
              <div className="t"><div><h3>{cat.name}</h3><p>{cat.description}</p></div><span className="ar"><Icon n="arrow" s={18} /></span></div>
            </Link>
          ))}
        </div>
      </div></section>

      <section className="sec alt"><div className="container">
        <div className="sh"><div><h2>Customer favourites</h2><p>The products our customers keep coming back for.</p></div><Link className="lnk" href="/shop?flag=best">View all best sellers <Icon n="arrow" s={16} /></Link></div>
        <ProductGrid items={best} />
      </div></section>

      <section className="sec" style={{ paddingBottom: 0 }}><div className="container">
        <div className="banner">
          <div>
            <h2>Spa &amp; Wellness</h2>
            <p>Treatments, massage oils, bath soaks and rituals made for resting, resetting and glowing.</p>
            <Link className="btn light" href="/spa">Explore the spa</Link>
          </div>
          <div className="vis">{spaPick.slice(0, 2).map((p, i) => <div key={p.id}><ProductArt product={p} variant={i + 1} /></div>)}</div>
        </div>
      </div></section>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Just in</h2><p>Fresh arrivals for your shelf.</p></div><Link className="lnk" href="/shop?flag=new">View all new arrivals <Icon n="arrow" s={16} /></Link></div>
        <ProductGrid items={fresh} cols="g3" />
      </div></section>

      <section className="sec alt"><div className="container">
        <div className="sh"><div><h2>Shop by concern</h2><p>Start with what your skin is asking for.</p></div></div>
        <div className="grid g6">
          {Object.entries(CONCERNS).map(([k, label]) => (
            <Link key={k} className="cn" href={`/shop?concern=${k}`}><Icon n="drop" s={22} /><div><span>{label}</span><br /><small>{CONCERN_DESC[k]}</small></div></Link>
          ))}
        </div>
      </div></section>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Why shop with us</h2></div></div>
        <div className="trust">
          {[['shield', 'Authentic Products', 'Carefully sourced beauty products.'], ['truck', 'Fast Delivery', 'Reliable delivery across Nigeria.'], ['lock', 'Secure Payments', 'Safe and convenient checkout.'], ['chat', 'Real Customer Support', 'Need help? Chat with us on WhatsApp.']].map(([i, t, d]) => (
            <div key={t}><span className="ico"><Icon n={i} s={22} /></span><h4>{t}</h4><p>{d}</p></div>
          ))}
        </div>
      </div></section>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Follow our beauty diary</h2><p>Follow @tripplehskinluxe for little rituals, shelf-fies and new arrivals.</p></div>
          {store.social.instagram && <a className="btn ghost s" href={store.social.instagram} target="_blank" rel="noopener noreferrer">Follow us on Instagram</a>}</div>
        <div className="insta">
          {[...best, ...fresh].slice(0, 6).map((p, i) => (
            <a key={p.id + i} href={store.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><ProductArt product={p} variant={i} /></a>
          ))}
        </div>
      </div></section>

      <section className="sec" style={{ paddingTop: 0 }}><div className="container">
        <div className="news">
          <h2>Stay in the know</h2>
          <p className="mut" style={{ marginTop: 10 }}>Get first access to new arrivals, beauty tips and exclusive offers.</p>
          <Newsletter />
        </div>
      </div></section>
    </>
  );
}
