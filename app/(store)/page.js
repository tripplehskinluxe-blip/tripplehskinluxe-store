import Link from 'next/link';
import HeroCollage from '@/components/HeroCollage';
import ProductGrid from '@/components/ProductGrid';
import Newsletter from '@/components/Newsletter';
import Icon from '@/components/Icon';
import { getHome, getCategories, getBrands, hasDb } from '@/lib/catalog.js';
import { CONCERNS } from '@/data/seed-products.js';
import { getSettings } from '@/lib/settings.js';
import { art } from '@/lib/art.js';
import { HERO_IMAGES } from '@/lib/hero-images.js';

export const revalidate = 60;

const CONCERN_IMG = { dry: '/concerns/dry.webp', acne: '/concerns/acne.webp', darkspots: '/concerns/darkspots.webp', pigment: '/concerns/pigment.webp', sensitive: '/concerns/sensitive.webp', glow: '/concerns/glow.webp' };
const CONCERN_ICON = { acne: 'acne', dry: 'hydrate', darkspots: 'spots', pigment: 'tone', sensitive: 'calm', glow: 'glow' };
const CONCERN_DESC = { acne: 'Clear, calm, balanced', dry: 'Deep, lasting hydration', darkspots: 'Even out your tone', pigment: 'Brighter, smoother skin', sensitive: 'Gentle, barrier-first care', glow: 'Lit-from-within skin' };
const ph = { id: 'ph', slug: 'ph', category: 'Skincare', subcategory: '', name: '', brand: '' };

export default async function Home() {
  const { store, spa } = await getSettings();
  const [{ best, fresh }, cats, dbBrands] = await Promise.all([getHome(), getCategories(), hasDb ? getBrands() : Promise.resolve([])]);
  const [a, b, c] = [best[1] || best[0] || ph, fresh[0] || best[0] || ph, best[4] || best[0] || ph];
  // Hero rotates your existing product photos plus the extra images
  const own = [a, b, c].flatMap((p) => (p.images || []).slice(0, 1).map((src) => ({ src, alt: p.name })));
  const slides = [...own, ...HERO_IMAGES].filter((x, i, arr) => arr.findIndex((y) => y.src === x.src) === i);
  // Brands strip: the brands you named first, then any other brand found in your catalogue
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const seen = new Set();
  const brandList = [...dbBrands.map((x) => x.name), 'COSRX', 'Face Facts', 'Nine Less', 'Dr. Althea', 'Garnier']
    .filter((t) => t && !seen.has(norm(t)) && seen.add(norm(t)))
    .slice(0, 16);
  const marqueeCopy = Array.from({ length: Math.max(1, Math.ceil(14 / brandList.length)) }, () => brandList).flat();

  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div className="hero-copy">
            <h1>{store.tagline}</h1>
            <p>Discover skincare, body care, hair care, fragrance and spa essentials carefully selected for your everyday routine.</p>
            <Link className="hero-link" href="/shop">Shop now</Link>
          </div>
          <HeroCollage slides={slides} />
        </div>
      </section>
      <div className="strip">
        <span className="strip-lab">Authentic products</span>
        <div className="mq" aria-label="Brands we stock">
          <div className="mq-track">
            {[0, 1].map((n) => (
              <div className="mq-set" key={n} aria-hidden={n === 1}>
                {marqueeCopy.map((t, i) => <Link key={`${n}-${i}`} href={`/shop?brand=${encodeURIComponent(t)}`} tabIndex={n === 1 ? -1 : undefined}>{t}</Link>)}
              </div>
            ))}
          </div>
        </div>
      </div>

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
            <Link key={k} className={'cn has-img' + (CONCERN_IMG[k] ? '' : ' no-img')} href={`/shop?concern=${k}`}>{CONCERN_IMG[k] ? <img className="cn-ph" src={CONCERN_IMG[k]} alt="" width="344" height="364" loading="lazy" decoding="async" /> : <span className="ci"><Icon n={CONCERN_ICON[k] || 'drop'} s={26} /></span>}<div><span>{label}</span><br /><small>{CONCERN_DESC[k]}</small></div></Link>
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
