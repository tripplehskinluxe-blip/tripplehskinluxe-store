import { parseBlocks, fillTokens, tokenValues } from '@/lib/legal.js';
import { fmtDate } from '@/lib/format.js';

export default function LegalPage({ page, settings }) {
  const blocks = parseBlocks(fillTokens(page.body, tokenValues(settings)));
  return (
    <>
      <div className="ph"><div className="container"><h1>{page.title}</h1>{page.updatedAt && <p>Last updated {fmtDate(page.updatedAt)}</p>}</div></div>
      <div className="container legal" style={{ maxWidth: 820, padding: '40px 20px 90px' }}>
        {blocks.map((b, i) => {
          if (b.t === 'h2') return <h2 key={i} style={{ fontSize: 24, margin: '30px 0 10px' }}>{b.text}</h2>;
          if (b.t === 'h3') return <h3 key={i} style={{ fontSize: 19, margin: '22px 0 8px' }}>{b.text}</h3>;
          if (b.t === 'ul') return <ul key={i} style={{ margin: '8px 0 14px', paddingLeft: 22, color: '#4d4060' }}>{b.items.map((x, j) => <li key={j} style={{ margin: '5px 0' }}>{x}</li>)}</ul>;
          return <p key={i} style={{ margin: '10px 0', color: '#4d4060', whiteSpace: 'pre-line' }}>{b.text}</p>;
        })}
      </div>
    </>
  );
}
