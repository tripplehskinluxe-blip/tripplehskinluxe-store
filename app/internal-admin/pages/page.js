'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/admin/AdminProvider';
import { PageHead, AdminOnly } from '@/components/admin/ui';
import { LEGAL_DEFAULTS, LEGAL_SLUGS } from '@/content/legal.js';
import { fmtDate } from '@/lib/format.js';

const URLS = { privacy: '/privacy', terms: '/terms', returns: '/returns' };

function Inner() {
  const { sb, toast } = useAdmin();
  const [slug, setSlug] = useState('privacy');
  const [saved, setSaved] = useState(null);       // the row in the database, or null when the built-in draft is in use
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from('pages').select('slug,title,body,updated_at').eq('slug', slug).maybeSingle();
    if (error) { toast('Could not load the page'); setLoading(false); return; }
    setSaved(data || null);
    setTitle(data ? data.title : LEGAL_DEFAULTS[slug].title);
    setBody(data ? data.body : LEGAL_DEFAULTS[slug].body);
    setLoading(false);
  }, [sb, slug, toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!title.trim() || !body.trim()) { toast('Add a title and some text first'); return; }
    setBusy(true);
    const { error } = await sb.from('pages').upsert({ slug, title: title.trim(), body }, { onConflict: 'slug' });
    setBusy(false);
    if (error) { toast('Could not save. Check you are signed in with two-factor.'); return; }
    toast('Saved. The live page updates within a minute.'); load();
  };
  const reset = async () => {
    if (!confirm('Go back to the built-in draft text? Your saved version will be deleted.')) return;
    const { error } = await sb.from('pages').delete().eq('slug', slug);
    if (error) toast('Could not reset'); else { toast('Back to the built-in draft'); load(); }
  };

  return (
    <>
      <PageHead title="Legal pages" sub="Privacy, Terms and Returns shown on the shop. Have a lawyer review the wording before launch.">
        <a className="btn ghost s" href={URLS[slug]} target="_blank" rel="noopener noreferrer">View live page</a>
      </PageHead>
      <div className="pnl">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {LEGAL_SLUGS.map((s) => <button key={s} className={`btn s ${s === slug ? '' : 'ghost'}`} onClick={() => setSlug(s)}>{LEGAL_DEFAULTS[s].title}</button>)}
        </div>
        <p className="mut sm" style={{ marginBottom: 14 }}>
          {saved ? `Your saved version. Last changed ${fmtDate(saved.updated_at)}.` : 'Showing the built-in draft. Saving creates your own version.'}
        </p>
        {loading ? <p className="mut">Loading…</p> : (
          <>
            <div className="fld"><label className="f" htmlFor="lp_t">Title</label><input id="lp_t" className="inp" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="fld"><label className="f" htmlFor="lp_b">Text</label><textarea id="lp_b" className="inp" rows={26} maxLength={60000} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.55 }} /></div>
            <p className="mut sm" style={{ marginBottom: 14 }}>
              Formatting: <code># Heading</code> · <code>## Sub-heading</code> · <code>- list item</code> · a blank line starts a new paragraph.
              These are filled in automatically: <code>{'{{name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{phone}}'}</code> <code>{'{{address}}'}</code> <code>{'{{hours}}'}</code> <code>{'{{lagosFee}}'}</code> <code>{'{{otherFee}}'}</code> <code>{'{{freeThreshold}}'}</code> <code>{'{{lagosDays}}'}</code> <code>{'{{otherDays}}'}</code> <code>{'{{returnDays}}'}</code>.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              {saved && <button className="btn danger" onClick={reset}>Reset to built-in draft</button>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
export default function LegalPages() { return <AdminOnly><Inner /></AdminOnly>; }
