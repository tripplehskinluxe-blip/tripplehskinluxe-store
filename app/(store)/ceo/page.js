import Link from 'next/link';
import { getSettings } from '@/lib/settings.js';
import { socialLabel, fillTokens, tokenValues } from '@/lib/settings-core.js';

export const metadata = { title: 'Meet the CEO' };

const initials = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default async function CeoPage() {
  const cfg = await getSettings();
  const c = cfg.ceo;
  const v = tokenValues(cfg);
  const name = c.name || 'Our founder';
  const bio = c.bio.map((x) => fillTokens(x, v));
  const socials = Object.entries(c.socials || {}).filter(([, val]) => val).map(([k, val]) => [k === 'whatsapp' ? 'WhatsApp' : socialLabel[k], k === 'whatsapp' ? `https://wa.me/${val}` : val]);

  return (
    <>
      <div className="ph"><div className="container"><div className="crumb"><Link href="/">Home</Link> / About</div><h1>Meet the CEO</h1></div></div>
      <div className="container" style={{ padding: '56px 20px 90px' }}>
        <div className="ceo">
          <div className="ceo-ph">{c.photo ? <img src={c.photo} alt={name} /> : <span aria-hidden="true">{c.name ? initials(c.name) : 'THS'}</span>}</div>
          <div>
            <span className="brand" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>{c.title}</span>
            <h2 style={{ margin: '6px 0 0' }}>{name}</h2>
            {c.quote && <blockquote>“{c.quote}”</blockquote>}
            <div style={{ margin: '18px 0 26px', display: 'grid', gap: 14, color: '#4d4060', fontSize: 16 }}>{bio.map((p, i) => <p key={i}>{p}</p>)}</div>
            {socials.length > 0 && (<><p className="mut sm" style={{ marginBottom: 10 }}>Follow {c.name ? c.name.split(' ')[0] : 'us'}</p><div className="soc">{socials.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}</div></>)}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 30 }}>
              <Link className="btn" href="/spa">Book a spa visit</Link><Link className="btn ghost" href="/shop">Shop the collection</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
