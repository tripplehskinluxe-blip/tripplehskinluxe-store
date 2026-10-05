import Link from 'next/link';
import { getSettings } from '@/lib/settings.js';
import { naira } from '@/lib/format.js';

export const metadata = { title: 'Delivery' };

export default async function Delivery() {
  const { delivery: d } = await getSettings();
  return (
    <>
      <div className="ph"><div className="container"><h1>Delivery information</h1><p>Fast, tracked delivery across Nigeria.</p></div></div>
      <div className="container" style={{ maxWidth: 860, padding: '44px 20px 90px' }}>
        <div className="box" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl-f"><tbody>
            <tr><th>Destination</th><th>Time</th><th>Fee</th></tr>
            <tr><td>Lagos</td><td>{d.lagosDays}</td><td>{naira(d.lagosFee)}</td></tr>
            <tr><td>Other Nigerian states</td><td>{d.otherDays}</td><td>{naira(d.otherFee)}</td></tr>
          </tbody></table>
        </div>
        <p style={{ margin: '22px 0' }}>Free Lagos delivery on orders over <b>{naira(d.freeThreshold)}</b>.{d.processingNote ? ` ${d.processingNote}` : ''} You&apos;ll get an update when your order ships.</p>
        <Link className="btn" href="/track-order">Track an order</Link>
      </div>
    </>
  );
}
