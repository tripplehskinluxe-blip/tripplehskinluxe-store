import { allSlugs } from '@/lib/catalog.js';

export default async function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const pages = ['', '/shop', '/spa', '/brands', '/offers', '/about', '/ceo', '/contact', '/delivery', '/faq', '/returns', '/terms', '/privacy'].map((p) => ({ url: base + p }));
  const slugs = await allSlugs();
  return [...pages, ...slugs.map((s) => ({ url: `${base}/product/${s}` }))];
}
