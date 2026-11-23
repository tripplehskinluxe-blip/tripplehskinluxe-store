// Shipping options for a delivery address. Pure: no database, no screen. The server runs it on every checkout.
// Rules:
// - Lagos: the local government chosen is the anchor. Its standard zone is always an option.
// - A specific area inside that local government is recommended when the address names it. The standard option stays available.
// - Blocking happens ONLY when the address names a specific area that belongs to exactly one OTHER local government
//   (and that area name is not listed under more than one local government). Nothing else blocks.
// - Unknown addresses are never blocked: the standard options are offered and the order is flagged for review.
// - Outside Lagos: a city rate is used when the address names that city; otherwise the flat inter-state rate.

export function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// True when the phrase appears as whole words in the address (so "iba" does not match "ibadan").
export function phraseIn(address, phrase) {
  const a = ' ' + normalise(address) + ' ';
  const p = normalise(phrase);
  return p.length > 0 && a.includes(' ' + p + ' ');
}

const phrasesOf = (area) => [area.name, ...(area.aliases || [])];
const longestMatch = (address, area) => {
  let best = 0;
  for (const p of phrasesOf(area)) if (phraseIn(address, p)) best = Math.max(best, normalise(p).length);
  return best;
};

export function resolveShipping(data, { state, lga, address }) {
  const st = String(state || '').trim();
  if (!st) return { ok: false, reason: 'no_state', options: [], recommended: null, mismatch: null, flags: [] };

  const zones = (data.zones || []).filter((z) => z.active);
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  if (st.toLowerCase() !== 'lagos') {
    const flat = zones.find((z) => z.kind === 'interstate') || null;
    const cities = (data.cities || [])
      .filter((c) => c.active && String(c.state).toLowerCase() === st.toLowerCase() && phraseIn(address, c.city))
      .sort((a, b) => normalise(b.city).length - normalise(a.city).length);
    const options = cities.map((c) => ({ id: 'city:' + c.id, type: 'city', label: c.city, zone: flat ? flat.name : null, fee: c.fee_ngn ?? null, priced: c.fee_ngn != null }));
    if (flat) options.push({ id: 'interstate', type: 'interstate', label: `Inter-state (${st})`, zone: flat.name, fee: flat.fee_ngn ?? null, priced: flat.fee_ngn != null });
    return { ok: options.length > 0, mode: 'interstate', options, recommended: options[0] ? options[0].id : null, mismatch: null,
      flags: options.length ? [] : ['no_interstate_zone'] };
  }

  const lgaRow = (data.lgas || []).find((l) => l.name === lga);
  if (!lgaRow) return { ok: false, reason: 'invalid_lga', options: [], recommended: null, mismatch: null, flags: [] };
  const zone = zoneById.get(lgaRow.zone_id) || null;
  const standard = { id: 'lga:' + lga, type: 'lga', label: `${lga} (standard)`, zone: zone ? zone.name : null, fee: zone ? zone.fee_ngn ?? null : null, priced: !!zone && zone.fee_ngn != null };

  const areas = (data.areas || []).filter((a) => a.active);
  const here = areas.filter((a) => a.lga === lga).map((a) => ({ a, len: longestMatch(address, a) })).filter((x) => x.len > 0).sort((x, y) => y.len - x.len);
  const specific = here.map(({ a }) => {
    const z = a.zone_id ? zoneById.get(a.zone_id) || null : zone;
    const fee = a.fee_ngn ?? (z ? z.fee_ngn ?? null : null);
    return { id: 'area:' + a.id, type: 'area', label: `${a.name} (${lga})`, zone: z ? z.name : null, fee, priced: fee != null };
  });

  // which local governments each phrase is listed under (across ALL areas, active or not): a phrase listed under two or more is never used to block
  const listedUnder = new Map();
  for (const a of data.areas || []) for (const p of phrasesOf(a)) {
    const k = normalise(p); if (!listedUnder.has(k)) listedUnder.set(k, new Set()); listedUnder.get(k).add(a.lga);
  }
  const otherMatches = areas.filter((a) => a.lga !== lga && longestMatch(address, a) > 0);
  const ambiguousHit = otherMatches.some((a) => phrasesOf(a).some((p) => phraseIn(address, p) && (listedUnder.get(normalise(p)) || new Set()).size > 1));
  const unambiguousOther = otherMatches.filter((a) => phrasesOf(a).some((p) => phraseIn(address, p) && (listedUnder.get(normalise(p)) || new Set()).size === 1));

  let mismatch = null;
  if (specific.length === 0 && unambiguousOther.length > 0) {
    const a = unambiguousOther[0];
    mismatch = { chosen_lga: lga, correct_lga: a.lga, area: a.name };
  }

  const flags = [];
  if (specific.length === 0 && otherMatches.length === 0) flags.push('unknown_area');
  if (ambiguousHit) flags.push('ambiguous_area');
  for (const other of (data.lgaNames || []).filter((n) => n !== lga)) if (phraseIn(address, other)) { flags.push('lga_mentioned'); break; }

  const options = [...specific, standard];
  return { ok: mismatch === null, mode: 'lga', options, recommended: specific.length ? specific[0].id : standard.id, mismatch, flags };
}

// The 20 Lagos local governments, in the order shown to customers.
export const LAGOS_LGAS = ['Agege','Ajeromi-Ifelodun','Alimosho','Amuwo-Odofin','Apapa','Badagry','Epe','Eti-Osa','Ibeju-Lekki','Ifako-Ijaiye','Ikeja','Ikorodu','Kosofe','Lagos Island','Lagos Mainland','Mushin','Ojo','Oshodi-Isolo','Shomolu','Surulere'];

// The server's decision on the option the customer chose. Only an option the server itself offered, and that has a price, can be paid.
// Nothing the browser sends sets a fee: the fee comes from the server's own data.
export function chooseShipping(resolved, optionId, state) {
  if (!resolved) return { ok: false, code: 'SHIPPING_UNAVAILABLE', error: 'We could not work out delivery for this address. Please try again.' };
  if (resolved.mismatch) return { ok: false, code: 'SHIPPING_MISMATCH', correct_lga: resolved.mismatch.correct_lga,
    error: `This address is in ${resolved.mismatch.correct_lga}, not the local government you chose. Please choose ${resolved.mismatch.correct_lga}.` };
  if (!resolved.ok) return { ok: false, code: 'SHIPPING_UNAVAILABLE', error: 'We do not deliver to this address yet. Please choose store pickup or contact us.' };
  const opt = resolved.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, code: 'SHIPPING_NOT_OFFERED', error: 'That delivery option is not available for this address. Please choose again.' };
  if (!opt.priced || opt.fee == null) return { ok: false, code: 'SHIPPING_UNPRICED', error: 'The delivery price for this option is not set yet. Please choose another option.' };
  const isLagos = String(state || '').trim().toLowerCase() === 'lagos';
  return { ok: true, fee: opt.fee, freeEligible: isLagos && (opt.type === 'lga' || opt.type === 'area'), label: opt.label, type: opt.type };
}
