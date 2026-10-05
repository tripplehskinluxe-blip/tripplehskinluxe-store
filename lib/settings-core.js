// Store settings: what can be edited, how each value is checked, and how saved values are merged over the first-run defaults.
// Plain JS with relative imports only, so it runs in the browser, in Next.js server code and in the Railway listener.
import { DEFAULT_SETTINGS } from '../content/defaults.js';
import { naira } from './format.js';

export { DEFAULT_SETTINGS };
export const SETTING_KEYS = ['store', 'delivery', 'ceo', 'spa', 'faq', 'about'];
export const socialLabel = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', x: 'X' };

// ---- the description of every setting. The admin form is drawn from this AND the server checks it, so they cannot disagree.
const str = (label, max, o = {}) => ({ t: 'str', label, max, ...o });
const int = (label, min, max, o = {}) => ({ t: 'int', label, min, max, ...o });
const bool = (label, o = {}) => ({ t: 'bool', label, ...o });
const list = (label, item, max, o = {}) => ({ t: 'list', label, item, max, ...o });
const obj = (label, fields, o = {}) => ({ t: 'obj', label, fields, ...o });
const socials = (extra = {}) => obj('Social links', {
  instagram: str('Instagram link', 300, { kind: 'url' }), tiktok: str('TikTok link', 300, { kind: 'url' }), facebook: str('Facebook link', 300, { kind: 'url' }),
  youtube: str('YouTube link', 300, { kind: 'url' }), x: str('X (Twitter) link', 300, { kind: 'url' }), ...extra,
}, { help: 'Leave a box empty to hide that icon. Links must start with https://' });

export const SPEC = {
  store: obj('Business & contact', {
    name: str('Shop name', 60, { req: true }),
    tagline: str('Tagline', 120, { req: true }),
    announceOn: bool('Show the announcement bar at the top of every page'),
    announce: str('Announcement text', 160, { help: 'You can use {{freeThreshold}} to show the free-delivery amount automatically.' }),
    whatsapp: str('WhatsApp number', 15, { kind: 'digits', req: true, help: 'International format, digits only. Example: 2348012345678' }),
    phone: str('Phone number', 25, { kind: 'phone', req: true }),
    email: str('Email address', 120, { kind: 'email', req: true }),
    address: str('Shop address', 200, { req: true }),
    hours: str('Opening hours', 120),
    social: socials(),
  }),
  delivery: obj('Delivery & returns', {
    lagosFee: int('Delivery fee inside Lagos (₦)', 0, 1000000),
    otherFee: int('Delivery fee outside Lagos (₦)', 0, 1000000),
    freeThreshold: int('Free Lagos delivery on orders over (₦)', 0, 100000000, { help: 'Set a very high number (for example 100000000) to switch free delivery off.' }),
    lagosDays: str('Lagos delivery time', 60, { req: true, help: 'Example: 1–3 working days' }),
    otherDays: str('Other states delivery time', 60, { req: true }),
    returnDays: int('Days to return an unopened product', 1, 365),
    processingNote: str('Processing note', 200, { help: 'Shown on the Delivery page. Leave empty to hide it.' }),
  }),
  ceo: obj('CEO page', {
    name: str('Her name', 80, { help: 'Leave empty to show the page without a name.' }),
    title: str('Her title', 80),
    photo: str('Portrait photo', 300, { kind: 'image', help: 'Upload a photo, or leave empty to show her initials.' }),
    quote: str('One-line quote', 300),
    bio: list('Her story (one box per paragraph)', str('Paragraph', 1500, { req: true, multiline: true }), 8),
    socials: socials({ whatsapp: str('Her WhatsApp number', 15, { kind: 'digits', help: 'Digits only, with country code.' }) }),
  }),
  spa: obj('Spa menu', {
    headline: str('Page heading', 80, { req: true }),
    intro: str('Introduction', 400, { multiline: true }),
    services: list('Treatments', obj('Treatment', {
      name: str('Name', 80, { req: true }),
      duration: str('Duration', 30, { help: 'Example: 60 min' }),
      from: int('Price from (₦)', 0, 10000000, { optional: true, help: 'Leave empty to show "Ask for pricing".' }),
      description: str('Description', 300, { multiline: true }),
    }), 30),
  }),
  faq: obj('FAQ', {
    items: list('Questions', obj('Question', { q: str('Question', 160, { req: true }), a: str('Answer', 1200, { req: true, multiline: true }) }), 40, {
      help: 'In answers you can use {{otherFee}} {{lagosFee}} {{freeThreshold}} {{lagosDays}} {{otherDays}} {{returnDays}} {{email}} {{phone}} {{name}} and they update by themselves.' }),
  }),
  about: obj('About page', {
    story: str('Our story', 1500, { req: true, multiline: true }),
    sections: list('Sections', obj('Section', { title: str('Heading', 80, { req: true }), text: str('Text', 800, { req: true, multiline: true }) }), 10),
    trust: list('Trust badges', obj('Badge', { title: str('Heading', 60, { req: true }), text: str('Text', 200, { req: true }) }), 8),
  }),
};

// ---- validation. validate() is strict (used when an admin saves); lenient() never throws (used when reading from the database).
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const bad = (spec, msg) => ({ ok: false, error: `${spec.label}: ${msg}` });

export function validate(spec, v, ctx = {}) {
  switch (spec.t) {
    case 'str': {
      if (v === null || v === undefined) v = '';
      if (typeof v !== 'string') return bad(spec, 'must be text');
      if (CTRL.test(spec.multiline ? v.replace(/[\n\r\t]/g, ' ') : v)) return bad(spec, 'contains characters that are not allowed');
      let s = spec.multiline ? v.replace(/\r\n?/g, '\n').trim() : v.replace(/\s+/g, ' ').trim();
      if (spec.kind === 'digits') s = s.replace(/[\s+()-]/g, '');          // "+234 801 234 5678" is fine: spaces and + are removed first
      if (s.length > spec.max) return bad(spec, `is too long (maximum ${spec.max} characters)`);
      if (!s) return spec.req ? bad(spec, 'cannot be empty') : { ok: true, value: '' };
      if (spec.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return bad(spec, 'is not a valid email address');
      if (spec.kind === 'phone' && !/^[+()\d\s-]{6,25}$/.test(s)) return bad(spec, 'is not a valid phone number');
      if (spec.kind === 'digits' && !/^\d{8,15}$/.test(s)) return bad(spec, 'must be 8 to 15 digits, numbers only');
      if (spec.kind === 'url' || spec.kind === 'image') {
        // a file in the site's own public folder, e.g. /ceo.jpg. Never '//host/...' (that means another website) and never '..'
        if (spec.kind === 'image' && /^\/(?!\/)[A-Za-z0-9._/-]{1,120}$/.test(s) && !s.includes('..')) return { ok: true, value: s };
        let u; try { u = new URL(s); } catch { return bad(spec, 'is not a valid link'); }
        if (u.protocol !== 'https:' || !u.hostname.includes('.')) return bad(spec, 'must be a link starting with https://');
        if (spec.kind === 'image' && ctx.imageHosts && !ctx.imageHosts.some((h) => u.hostname === h || u.hostname.endsWith('.supabase.co')))
          return bad(spec, 'must be a photo uploaded here (other websites cannot be shown)');
      }
      return { ok: true, value: s };
    }
    case 'int': {
      if ((v === null || v === undefined || v === '') && spec.optional) return { ok: true, value: null };
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,9}$/.test(v.trim()) ? Number(v) : NaN);
      if (!Number.isInteger(n)) return bad(spec, 'must be a whole number');
      if (n < spec.min || n > spec.max) return bad(spec, `must be between ${spec.min} and ${spec.max}`);
      return { ok: true, value: n };
    }
    case 'bool': return typeof v === 'boolean' ? { ok: true, value: v } : bad(spec, 'must be on or off');
    case 'list': {
      if (!Array.isArray(v)) return bad(spec, 'must be a list');
      if (v.length > spec.max) return bad(spec, `has too many items (maximum ${spec.max})`);
      const out = [];
      for (const [i, x] of v.entries()) { const r = validate(spec.item, x, ctx); if (!r.ok) return { ok: false, error: `${spec.label} #${i + 1} → ${r.error}` }; out.push(r.value); }
      return { ok: true, value: out };
    }
    case 'obj': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(spec, 'is not valid');
      const out = {};
      for (const [k, f] of Object.entries(spec.fields)) { const r = validate(f, v[k], ctx); if (!r.ok) return r; out[k] = r.value; }
      return { ok: true, value: out };       // unknown keys are dropped
    }
    default: return bad(spec, 'unknown field');
  }
}

export function lenient(spec, raw, dflt) {
  if (spec.t === 'obj') {
    const out = {};
    for (const [k, f] of Object.entries(spec.fields)) out[k] = lenient(f, raw && typeof raw === 'object' ? raw[k] : undefined, dflt?.[k]);
    return out;
  }
  if (spec.t === 'list') {
    if (!Array.isArray(raw)) return dflt;
    return raw.slice(0, spec.max).map((x) => lenient(spec.item, x, undefined)).filter((x) => x !== undefined && !(typeof x === 'object' && x && Object.values(x).some((y) => y === undefined)));
  }
  if (raw === undefined) return dflt;
  const r = validate(spec, raw);
  return r.ok ? r.value : dflt;
}

/** Strict check used when saving. Returns { ok, value } or { ok:false, error }. */
export const sanitize = (key, value, ctx) => (SPEC[key] ? validate(SPEC[key], value, ctx) : { ok: false, error: 'Unknown setting' });

/** rows = [{ key, value }] from the database. Missing or damaged values fall back to the defaults, field by field. */
export function buildSettings(rows = []) {
  const by = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const out = {};
  for (const k of SETTING_KEYS) out[k] = lenient(SPEC[k], by[k], DEFAULT_SETTINGS[k]);
  return out;
}

/** client = any Supabase client (public/anon is enough: settings are public to read). Throws if the database cannot be read. */
export async function loadSettings(client) {
  if (!client) return buildSettings([]);
  const { data, error } = await client.from('settings').select('key,value');
  if (error) throw new Error('settings could not be loaded');
  return buildSettings(data);
}

// ---- helpers used everywhere
export function tokenValues(s) {
  return {
    name: s.store.name, email: s.store.email, phone: s.store.phone, address: s.store.address, hours: s.store.hours,
    lagosFee: naira(s.delivery.lagosFee), otherFee: naira(s.delivery.otherFee), freeThreshold: naira(s.delivery.freeThreshold),
    lagosDays: s.delivery.lagosDays, otherDays: s.delivery.otherDays, returnDays: String(s.delivery.returnDays),
  };
}
export const fillTokens = (text, values) => String(text ?? '').replace(/\{\{(\w+)\}\}/g, (m, k) => (Object.hasOwn(values, k) ? values[k] : m));
export const announcement = (s) => (s.store.announceOn && s.store.announce ? fillTokens(s.store.announce, tokenValues(s)) : '');
export const waLink = (s, message, number) =>
  `https://wa.me/${String(number || s.store.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(message || `Hello ${s.store.name} 👋 I need help with my order/product.`)}`;
