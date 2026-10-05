import Link from 'next/link';
import ProductGrid from '@/components/ProductGrid';
import Icon from '@/components/Icon';
import { getProducts } from '@/lib/catalog.js';
import { getSettings } from '@/lib/settings.js';
import { waLink } from '@/lib/settings-core.js';
import { naira } from '@/lib/format.js';

export const metadata = { title: 'Spa & Wellness', description: 'Facials, massages and spa essentials.' };
export const revalidate = 60;

export default async function SpaPage() {
  const cfg = await getSettings();
  const { spa, store } = cfg;
  const { items } = await getProducts({ cat: 'Spa & Wellness', pageSize: 12 });
  return (
    <>
      <section className="spa-hero"><div className="container">
        <h1>{spa.headline}</h1>
        <p>{spa.intro}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a className="btn light" href={waLink(cfg, `Hi ${store.name} 👋 I'd like to book a spa treatment.`)} target="_blank" rel="noopener noreferrer"><Icon n="chat" s={16} /> Book on WhatsApp</a>
          <Link className="btn ghost" href="/shop?cat=Spa%20%26%20Wellness" style={{ color: '#fff', borderColor: '#fff' }}>Shop spa essentials</Link>
        </div>
      </div></section>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Treatments</h2><p>Ask us about availability and pricing.</p></div></div>
        <div className="grid g3">
          {spa.services.map((s) => (
            <div key={s.name} className="svc">
              <span className="meta">{s.duration} · {s.from ? `From ${naira(s.from)}` : 'Ask for pricing'}</span>
              <h3>{s.name}</h3><p>{s.description}</p>
              <a className="btn ghost s" href={waLink(cfg, `Hi ${store.name} 👋 I'd like to book a ${s.name}.`)} target="_blank" rel="noopener noreferrer">Book this treatment</a>
            </div>
          ))}
        </div>
      </div></section>

      <section className="sec alt"><div className="container">
        <div className="sh"><div><h2>Visit the spa</h2></div></div>
        <div className="cols">
          <div>
            {[['pin', 'Address', store.address], ['clock', 'Opening hours', store.hours], ['phone', 'Call or WhatsApp', store.phone]].map(([i, t, v]) => (
              <div className="info" key={t}><span className="ico"><Icon n={i} s={18} /></span><div><b>{t}</b><br /><span className="mut">{v}</span></div></div>
            ))}
          </div>
          <div className="box"><h3 style={{ marginBottom: 10 }}>Book in minutes</h3><p className="mut" style={{ marginBottom: 18 }}>Message us the treatment you&apos;d like and a preferred day. We&apos;ll confirm a time on WhatsApp.</p>
            <a className="btn block" href={waLink(cfg, `Hi ${store.name} 👋 I'd like to book a spa visit.`)} target="_blank" rel="noopener noreferrer">Chat to book</a>
            <p className="sm mut" style={{ marginTop: 14 }}>Led by our founder. <Link className="lnk" href="/ceo">Meet the CEO</Link></p></div>
        </div>
      </div></section>

      <section className="sec"><div className="container">
        <div className="sh"><div><h2>Spa essentials</h2><p>Bring the ritual home.</p></div><Link className="lnk" href="/shop?cat=Spa%20%26%20Wellness">View all <Icon n="arrow" s={16} /></Link></div>
        {items.length ? <ProductGrid items={items} /> : <p className="mut">New spa products arriving soon.</p>}
      </div></section>
    </>
  );
}
