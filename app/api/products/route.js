import { NextResponse } from 'next/server';
import { getByIds } from '@/lib/catalog.js';

const ID = /^(seed-\d{1,3}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// Public product data for the bag and wishlist (ids come from the browser, so they are validated).
export async function GET(req) {
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => ID.test(s)).slice(0, 50);
  if (!ids.length) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await getByIds(ids) });
}
