import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/catalog.js';
import { rateLimit, getIp } from '@/lib/ratelimit.js';

export async function GET(req) {
  if (!rateLimit(`search:${getIp(req)}`, 60, 60_000)) return NextResponse.json({ items: [], total: 0 }, { status: 429 });
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 60);
  if (!q) return NextResponse.json({ items: [], total: 0 });
  const { items, total } = await getProducts({ q, pageSize: 8 });
  return NextResponse.json({ items, total });
}
