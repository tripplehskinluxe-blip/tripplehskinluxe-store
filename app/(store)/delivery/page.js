import Link from 'next/link';
import { getSettings } from '@/lib/settings.js';
import { naira } from '@/lib/format.js';
import { supabaseAdmin } from '@/lib/supabase-admin.js';
import { loadShippingData } from '@/lib/shipping-data.js';

export const metadata = { title: 'Delivery' };

// The table is read from the same delivery zones checkout uses, so the page and the price a customer pays always match.
export default async function Delivery() {
  const { delivery: d } = await getSettings();
  let lagos = null, interstate = null;
  try {
    const sd = await loadShippingData(supabaseAdmin(), d);
    lagos = sd.zones.filter((z) => z.active && z.kind === 'zone').sort((a, b) => a.name.localeCompare(b.name));
    interstate = sd.zones.find((z) => z.active && z.kind === 'interstate') || null;
  } catch (e) {
    console.error('delivery page zones', e?.message);
  }
  return (
    <>
      <div className="ph"><div className="container"><h1>Delivery information</h1><p>Fast, tracked delivery across Nigeria.</p><div className="pg-track"><img src="/icons/delivery.png" alt="" /></div></div></div>
      <div className="container" style={{ maxWidth: 860, padding: '44px 20px 90px' }}>
        <div className="box" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl-f"><tbody>
            <tr><th>Destination</th><th>Time</th><th>Fee</th></tr>
            {lagos && lagos.length > 0 ? lagos.map((z) => (
              <tr key={z.id}><td>Lagos · {z.name}</td><td>{d.lagosDays}</td><td>{z.fee_ngn != null ? naira(z.fee_ngn) : 'At checkout'}</td></tr>
            )) : (<tr><td>Lagos</td><td>{d.lagosDays}</td><td>{naira(d.lagosFee)}</td></tr>)}
            <tr><td>Other Nigerian states</td><td>{d.otherDays}</td><td>{interstate && interstate.fee_ngn != null ? naira(interstate.fee_ngn) : naira(d.otherFee)}</td></tr>
          </tbody></table>
        </div>
        <p style={{ margin: '22px 0' }}>Not sure which area you are in? Enter your address at checkout and you will see your exact delivery fee before you pay.</p>
        <p style={{ margin: '22px 0' }}>Free Lagos delivery on orders over <b>{naira(d.freeThreshold)}</b>.{d.processingNote ? ` ${d.processingNote}` : ''} You&apos;ll get an update when your order ships.</p>
        <Link className="btn" href="/track-order">Track an order</Link>
      </div>
    </>
  );
}
