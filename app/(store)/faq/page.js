import Link from 'next/link';
import { getSettings } from '@/lib/settings.js';
import { fillTokens, tokenValues } from '@/lib/settings-core.js';

export const metadata = { title: 'FAQ' };

export default async function Faq() {
  const cfg = await getSettings();
  const v = tokenValues(cfg);
  return (
    <>
      <div className="ph"><div className="container"><h1>Frequently asked questions</h1></div></div>
      <div className="container" style={{ maxWidth: 820, padding: '40px 20px 90px' }}>
        {cfg.faq.items.map((it) => <details key={it.q} className="faq acc"><summary>{fillTokens(it.q, v)}</summary><div style={{ marginTop: 10, color: '#4d4060', whiteSpace: 'pre-line' }}>{fillTokens(it.a, v)}</div></details>)}
        <p className="mut center" style={{ marginTop: 30 }}>Still stuck? <Link className="lnk" href="/contact">Contact us</Link></p>
      </div>
    </>
  );
}
