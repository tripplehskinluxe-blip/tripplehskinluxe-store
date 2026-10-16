'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { useSettings } from '@/components/SettingsProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import { LEGAL_DEFAULTS, LEGAL_SLUGS } from '@/content/legal.js';
import { parseBlocks } from '@/lib/legal.js';
import { fillTokens, tokenValues } from '@/lib/settings-core.js';
import { fmtDate } from '@/lib/format.js';

const URLS = { privacy: '/privacy', terms: '/terms', returns: '/returns' };

function Inner() {
  const { sb, toast } = useAdmin();
  const settings = useSettings();
  const [slug, setSlug] = useState('privacy');
  const [saved, setSaved] = useState(null);       // the row in the database, or null while the built-in text is in use
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from('pages').select('slug,title,body,updated_at').eq('slug', slug).maybeSingle();
    if (error) { toast('Could not load the page'); setLoading(false); return; }
    setSaved(data || null); setTitle(data ? data.title : LEGAL_DEFAULTS[slug].title); setBody(data ? data.body : LEGAL_DEFAULTS[slug].body);
    setEditing(false); setLoading(false);
  }, [sb, slug, toast]);
  useEffect(() => { load(); }, [load]);

  const pick = (s) => { if (s === slug) return; if (editing && !confirm('Discard your changes?')) return; setSlug(s); };
  const save = async () => {
    if (!title.trim() || !body.trim()) { toast('Add a title and some text first'); return; }
    setBusy(true);
    const { error } = await sb.from('pages').upsert({ slug, title: title.trim(), body }, { onConflict: 'slug' });
    setBusy(false);
    if (error) { toast('Could not save. Check you are signed in as the owner.'); return; }
    toast('Saved'); load();
  };
  const reset = async () => {
    if (!confirm('Go back to the built-in text? Your saved version will be deleted.')) return;
    const { error } = await sb.from('pages').delete().eq('slug', slug);
    if (error) toast('Could not reset'); else { toast('Done'); load(); }
  };
  const blocks = parseBlocks(fillTokens(body, tokenValues(settings)));

  return (
    <>
      <PageHead title="Legal pages" />
      <nav className="tabs">{LEGAL_SLUGS.map((s) => <button key={s} className={s === slug ? 'on' : ''} onClick={() => pick(s)}>{LEGAL_DEFAULTS[s].title}</button>)}</nav>
      {loading ? <p className="mut">Loading…</p> : editing ? (
        <div>
          <div className="fld"><label className="f" htmlFor="lp_t">Title</label><input id="lp_t" className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="fld"><label className="f" htmlFor="lp_b">Text</label><textarea id="lp_b" className="inp" rows={26} maxLength={60000} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.55 }} /></div>
          <div className="acts">
            <button className="btn s" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn ghost s" onClick={load} disabled={busy}>Cancel</button>
            {saved && <button className="lnkb" style={{ marginLeft: 'auto' }} onClick={reset}>Use built-in text</button>}
          </div>
        </div>
      ) : (
        <div>
          <div className="sec-h"><h2>{title}</h2><div style={{ display: 'flex', gap: 10 }}><a className="btn ghost s" href={URLS[slug]} target="_blank" rel="noopener noreferrer">View page</a><button className="btn ghost s" onClick={() => setEditing(true)}>Edit</button></div></div>
          <p className="mut sm" style={{ marginBottom: 12 }}>{saved ? `Saved ${fmtDate(saved.updated_at)}` : 'Built-in text'}</p>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20, maxHeight: 520, overflow: 'auto', color: '#4d4060', fontSize: 14.5 }}>
            {blocks.map((b, i) => {
              if (b.t === 'h2') return <h3 key={i} style={{ fontSize: 17, margin: '22px 0 6px', color: 'var(--ink)' }}>{b.text}</h3>;
              if (b.t === 'h3') return <h4 key={i} style={{ fontSize: 15, margin: '16px 0 4px' }}>{b.text}</h4>;
              if (b.t === 'ul') return <ul key={i} style={{ margin: '6px 0 12px', paddingLeft: 20 }}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
              return <p key={i} style={{ margin: '8px 0', whiteSpace: 'pre-line' }}>{b.text}</p>;
            })}
          </div>
        </div>
      )}
    </>
  );
}
export default function LegalPages() { return <AdminOnly><Inner /></AdminOnly>; }
