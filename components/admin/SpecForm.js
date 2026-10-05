'use client';
// Draws an editing form from a setting description (SPEC in lib/settings-core.js), so the form and the server's checks always agree.

export const setIn = (obj, path, val) => {
  if (!path.length) return val;
  const [k, ...rest] = path;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[k] = setIn(obj?.[k], rest, val);
  return copy;
};

export function emptyOf(spec) {
  if (spec.t === 'str') return '';
  if (spec.t === 'int') return spec.optional ? null : spec.min;
  if (spec.t === 'bool') return false;
  if (spec.t === 'list') return [];
  return Object.fromEntries(Object.entries(spec.fields).map(([k, f]) => [k, emptyOf(f)]));
}

const idOf = (path) => 'f_' + path.join('_');

function Leaf({ spec, value, path, onChange, onUpload, busy }) {
  const id = idOf(path);
  if (spec.t === 'bool') return (
    <label className="chk" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
      <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(path, e.target.checked)} /> {spec.label}
    </label>
  );
  const help = spec.help && <small className="mut" style={{ display: 'block', marginTop: 4 }}>{spec.help}</small>;
  if (spec.t === 'int') return (
    <div className="fld"><label className="f" htmlFor={id}>{spec.label}</label>
      <input id={id} className="inp" type="number" inputMode="numeric" min={spec.min} max={spec.max} step="1" value={value ?? ''} onChange={(e) => onChange(path, e.target.value === '' ? (spec.optional ? null : '') : Number(e.target.value))} />{help}</div>
  );
  return (
    <div className="fld"><label className="f" htmlFor={id}>{spec.label}</label>
      {spec.multiline
        ? <textarea id={id} className="inp" rows={4} maxLength={spec.max} value={value ?? ''} onChange={(e) => onChange(path, e.target.value)} />
        : <input id={id} className="inp" maxLength={spec.kind === 'digits' ? undefined : spec.max} value={value ?? ''} onChange={(e) => onChange(path, e.target.value)} />}   {/* numbers may be typed with + and spaces; the server tidies them and checks the length */}
      {spec.kind === 'image' && onUpload && (
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => onUpload(path, e)} />
          {value && <><img src={value} alt="" height={56} style={{ borderRadius: 8 }} /><button type="button" className="btn ghost s" onClick={() => onChange(path, '')}>Remove photo</button></>}
        </div>
      )}
      {help}</div>
  );
}

export default function SpecForm({ spec, value, path = [], onChange, onUpload, busy, hideTitle }) {
  if (spec.t === 'obj') {
    return (
      <div>
        {!hideTitle && <h3 style={{ margin: '4px 0 10px', fontSize: 18 }}>{spec.label}</h3>}
        {spec.help && <p className="mut sm" style={{ margin: '0 0 10px' }}>{spec.help}</p>}
        {Object.entries(spec.fields).map(([k, f]) => <SpecForm key={k} spec={f} value={value?.[k]} path={[...path, k]} onChange={onChange} onUpload={onUpload} busy={busy} />)}
      </div>
    );
  }
  if (spec.t === 'list') {
    const items = Array.isArray(value) ? value : [];
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const c = [...items]; [c[i], c[j]] = [c[j], c[i]]; onChange(path, c); };
    return (
      <div style={{ margin: '14px 0' }}>
        <h3 style={{ margin: '4px 0 6px', fontSize: 16 }}>{spec.label} <span className="mut sm">({items.length}/{spec.max})</span></h3>
        {spec.help && <p className="mut sm" style={{ margin: '0 0 8px' }}>{spec.help}</p>}
        {items.map((it, i) => (
          <div key={i} className="box" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
              <button type="button" className="btn ghost s" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className="btn ghost s" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="btn danger s" onClick={() => onChange(path, items.filter((_, j) => j !== i))}>Remove</button>
            </div>
            <SpecForm spec={spec.item} value={it} path={[...path, i]} onChange={onChange} onUpload={onUpload} busy={busy} hideTitle />
          </div>
        ))}
        {items.length < spec.max && <button type="button" className="btn ghost s" onClick={() => onChange(path, [...items, emptyOf(spec.item)])}>+ Add</button>}
      </div>
    );
  }
  return <Leaf spec={spec} value={value} path={path} onChange={onChange} onUpload={onUpload} busy={busy} />;
}
