import { naira } from '@/lib/format.js';

// Read-only view of a setting. The form (SpecForm) only appears when the person presses Edit.
function Val({ spec, value }) {
  if (spec.t === 'bool') return value ? 'On' : 'Off';
  if (spec.t === 'int') return value === null || value === undefined ? <span className="mut">None</span> : (spec.money ? naira(value) : String(value));
  if (!value) return <span className="mut">Not set</span>;
  if (spec.kind === 'image') return <img src={value} alt="" height={44} style={{ borderRadius: 8, display: 'block' }} />;
  return value;
}

const shown = (f, v) => (f.t === 'int' ? (v === null || v === undefined ? '' : f.money ? naira(v) : String(v)) : f.t === 'bool' ? '' : v || '');

export default function SpecView({ spec, value }) {
  if (spec.t === 'obj') {
    return (
      <dl style={{ margin: 0 }}>
        {Object.entries(spec.fields).map(([k, f]) => (f.t === 'obj' || f.t === 'list'
          ? <div key={k}><div className="vg">{f.label}</div><SpecView spec={f} value={value?.[k]} /></div>
          : <div className="vr" key={k}><dt>{f.label}</dt><dd><Val spec={f} value={value?.[k]} /></dd></div>))}
      </dl>
    );
  }
  if (spec.t === 'list') {
    const items = Array.isArray(value) ? value : [];
    if (!items.length) return <p className="mut sm" style={{ padding: '14px 0' }}>None</p>;
    return (
      <div className="vl">
        {items.map((it, i) => {
          if (typeof it === 'string') return <div key={i}><p style={{ margin: 0, color: 'inherit', WebkitLineClamp: 3 }}>{it}</p></div>;
          const entries = Object.entries(spec.item.fields || {});
          const [[, tf], ...others] = entries; const title = it[entries[0][0]];
          const meta = others.filter(([, f]) => !f.multiline).map(([k, f]) => shown(f, it[k])).filter(Boolean).join('  ·  ');
          const body = others.filter(([, f]) => f.multiline).map(([k]) => it[k]).filter(Boolean).join(' ');
          return <div key={i}><b>{title}</b>{meta && <span className="mut sm" style={{ marginLeft: 10 }}>{meta}</span>}{body && <p>{body}</p>}</div>;
        })}
      </div>
    );
  }
  return <Val spec={spec} value={value} />;
}
