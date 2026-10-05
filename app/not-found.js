import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container"><div className="empty" style={{ padding: '110px 0' }}>
      <h3>We couldn&apos;t find that page</h3><p>The page may have moved or no longer exists.</p><Link className="btn" href="/shop">Continue shopping</Link>
    </div></div>
  );
}
