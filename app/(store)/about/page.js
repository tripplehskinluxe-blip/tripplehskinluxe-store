import Link from 'next/link';
import { getSettings } from '@/lib/settings.js';
import { fillTokens, tokenValues } from '@/lib/settings-core.js';

export const metadata = { title: 'About us' };

export default async function About() {
  const cfg = await getSettings();
  const v = tokenValues(cfg);
  const { about, store } = cfg;
  return (
    <>
      <div className="ph"><div className="container"><h1>About {store.name}</h1></div></div>
      <div className="container" style={{ maxWidth: 860, padding: '50px 20px 30px' }}>
        <h2>Our story</h2>
        <p style={{ fontSize: 18, margin: '14px 0 40px', color: '#4d4060', whiteSpace: 'pre-line' }}>{fillTokens(about.story, v)}</p>
        {about.sections.map((s) => <div key={s.title}><h3 style={{ margin: '26px 0 8px', fontSize: 26 }}>{fillTokens(s.title, v)}</h3><p className="mut" style={{ whiteSpace: 'pre-line' }}>{fillTokens(s.text, v)}</p></div>)}
        <p style={{ marginTop: 34 }}><Link className="btn ghost" href="/ceo">Meet the CEO</Link></p>
      </div>
      {about.trust.length > 0 && (
        <div className="container" style={{ padding: '30px 20px 90px' }}>
          <div className="trust">{about.trust.map((t) => <div key={t.title}><h4>{fillTokens(t.title, v)}</h4><p>{fillTokens(t.text, v)}</p></div>)}</div>
        </div>
      )}
    </>
  );
}
