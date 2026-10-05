import Link from 'next/link';
import { buildQuery } from '@/lib/format.js';

export default function Pagination({ page, total, pageSize, params }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (n) => `/shop${buildQuery(params, { page: n > 1 ? n : '' })}`;
  return (
    <nav className="pager" aria-label="Pagination">
      {page > 1 && <Link className="btn ghost s" href={href(page - 1)}>Previous</Link>}
      <span className="cur">Page {page} of {pages}</span>
      {page < pages && <Link className="btn ghost s" href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
