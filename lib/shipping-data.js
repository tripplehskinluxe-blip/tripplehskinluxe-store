// Loads the shipping zones from the database and applies the Settings fees where a zone has no price yet.
// So a blank price never blocks an order: it falls back to the fee already in Settings (lagosFee / otherFee), as it does today.
const ZONE_COLS = 'id,name,kind,fee_ngn,active';

export function mapShippingRows({ zones, lgas, areas, cities }, delivery) {
  const lagosFee = delivery.lagosFee;
  const otherFee = delivery.otherFee;
  return {
    zones: zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, active: z.active,
      fee_ngn: z.fee_ngn != null ? z.fee_ngn : (z.kind === 'interstate' ? otherFee : lagosFee) })),
    lgas: lgas.map((l) => ({ name: l.name, zone_id: l.zone_id })),
    areas: areas.map((a) => ({ id: a.id, lga: a.lga, name: a.name, aliases: a.aliases || [], zone_id: a.zone_id, fee_ngn: a.fee_ngn, active: a.active })),
    cities: cities.map((c) => ({ id: c.id, state: c.state, city: c.city, fee_ngn: c.fee_ngn != null ? c.fee_ngn : otherFee, active: c.active })),
    lgaNames: lgas.map((l) => l.name),
  };
}

export async function loadShippingData(db, delivery) {
  const [z, l, a, c] = await Promise.all([
    db.from('shipping_zones').select(ZONE_COLS),
    db.from('shipping_lgas').select('name,zone_id'),
    db.from('shipping_areas').select('id,lga,name,aliases,zone_id,fee_ngn,active').eq('active', true),
    db.from('shipping_interstate_cities').select('id,state,city,fee_ngn,active').eq('active', true),
  ]);
  for (const r of [z, l, a, c]) if (r.error) throw new Error('shipping lookup: ' + r.error.message);
  return mapShippingRows({ zones: z.data || [], lgas: l.data || [], areas: a.data || [], cities: c.data || [] }, delivery);
}
