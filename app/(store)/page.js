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

const CONCERN_ICON = { acne: 'target', dry: 'drop', darkspots: 'moon', pigment: 'layers', sensitive: 'shield', glow: 'sun' };
const CONCERN_DESC = { acne: 'Clear, calm, balanced', dry: 'Deep, lasting hydration', darkspots: 'Even out your tone', pigment: 'Brighter, smoother skin', sensitive: 'Gentle, barrier-first care', glow: 'Lit-from-within skin' };
const ph = { id: 'ph', slug: 'ph', category: 'Skincare', subcategory: '', name: '', brand: '' };

export default async function Home() {
  const { store, delivery, spa } = await getSettings();
  const [{ best, fresh }, cats] = await Promise.all([getHome(), getCategories()]);
  const [a, b, c] = [best[1] || best[0] || ph, fresh[0] || best[0] || ph, best[4] || best[0] || ph];
  const strip = ['Authentic products', `Free Lagos delivery over ${naira(delivery.freeThreshold)}`, 'Secure payment with Paystack', 'Chat with us on WhatsApp'];

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
      <div className="strip"><div className="container">{strip.map((t) => <span key={t}>{t}</span>)}</div></div>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Shop by category</h2></div></div>
        <div className="grid g3">
          {cats.map((cat) => (
            <Link key={cat.name} className="cat" href={`/shop?cat=${encodeURIComponent(cat.name)}`}>
              <div className="media">{cat.image_url ? <img src={cat.image_url} alt={cat.name} loading="lazy" /> : <div className="art" dangerouslySetInnerHTML={{ __html: art({ id: cat.name, slug: cat.slug, category: cat.name, subcategory: '', name: '', brand: '' }, cat.name.length % 4) }} />}</div>
              <div className="t"><div><h3>{cat.name}</h3><p>{cat.description}</p></div><span className="ar"><Icon n="arrow" s={18} /></span></div>
            </Link>
          ))}
        </div>
      </div></section>

      <section className="sec alt"><div className="container">
        <div className="sh"><div><h2>Customer favourites</h2></div><Link className="lnk" href="/shop?flag=best">View all best sellers <Icon n="arrow" s={16} /></Link></div>
        <ProductGrid items={best} />
      </div></section>

      <section className="sec" style={{ paddingBottom: 0 }}><div className="container">
        <div className="banner">
          <div>
            <h2>Spa &amp; Wellness</h2>
            <p>Treatments, massage oils, bath soaks and rituals made for resting, resetting and glowing.</p>
            <Link className="btn light" href="/spa">Explore the spa</Link>
          </div>
          <div className="vis"><div className="photo"><img src={spa.photo || '/spa/hero.jpg'} alt="At our spa" loading="lazy" /></div></div>
        </div>
      </div></section>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Just in</h2></div><Link className="lnk" href="/shop?flag=new">View all new arrivals <Icon n="arrow" s={16} /></Link></div>
        <ProductGrid items={fresh} cols="g3" />
      </div></section>

      <section className="sec alt"><div className="container">
        <div className="sh"><div><h2>Shop by concern</h2></div></div>
        <div className="grid g6">
          {Object.entries(CONCERNS).map(([k, label]) => (
            <Link key={k} className="cn" href={`/shop?concern=${k}`}><Icon n={CONCERN_ICON[k] || 'drop'} s={24} /><div><span>{label}</span><br /><small>{CONCERN_DESC[k]}</small></div></Link>
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
