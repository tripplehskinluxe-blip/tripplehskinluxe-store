'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// A text box with a pick-list: customers can choose a suggested place OR type any place that is not listed.
export default function AreaInput({ id, label, value, onChange, suggestions, stateKey, error, hint = 'Pick from the list or type your own.' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();
  const prev = useRef({ stateKey, suggestions });

  // The state changed: drop a city that was PICKED from the old state's list. A place the customer typed themselves is kept.
  useEffect(() => {
    if (prev.current.stateKey !== stateKey) {
      if (value && prev.current.suggestions.includes(value)) onChange('');
      prev.current = { stateKey, suggestions };
    }
  }, [stateKey, suggestions, value, onChange]);

  const q = (value || '').trim().toLowerCase();
  const list = useMemo(() => {
    if (!q) return suggestions;
    const starts = suggestions.filter((s) => s.toLowerCase().startsWith(q));
    const has = suggestions.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
    return [...starts, ...has];
  }, [q, suggestions]);

  const show = open && suggestions.length > 0;
  const choose = (s) => { onChange(s); setOpen(false); setActive(-1); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (list.length ? (a + 1) % list.length : -1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((a) => (list.length ? (a <= 0 ? list.length - 1 : a - 1) : -1)); }
    else if (e.key === 'Enter' && show && active >= 0 && list[active]) { e.preventDefault(); choose(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="fld" ref={boxRef} onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <label className="f" htmlFor={id}>{label}</label>
      <div className="ac">
        <input
          id={id} ref={inputRef} className={`inp${error ? ' bad' : ''}`} type="text" autoComplete="off" maxLength={80}
          value={value} placeholder="Start typing, or pick from the list"
          role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        {suggestions.length > 0 && (
          <button type="button" className="ac-btn" tabIndex={-1} aria-label="Show suggested places"
            onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); inputRef.current?.focus(); }}>▾</button>
        )}
        {show && (
          <ul className="ac-list" id={listId} role="listbox">
            {list.length === 0 && <li className="ac-hint">Not in our list? Just keep typing, we will use exactly what you enter.</li>}
            {list.map((s, i) => (
              <li key={s} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="ac-opt"
                onMouseDown={(e) => { e.preventDefault(); choose(s); }}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      {error ? <span className="err">{error}</span> : <span className="hint">{hint}</span>}
    </div>
  );
}
