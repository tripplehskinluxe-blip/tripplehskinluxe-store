import { notFound } from 'next/navigation';
import LegalPage from '@/components/LegalPage';
import { getLegalPage } from '@/lib/pages.js';
import { getSettings } from '@/lib/settings.js';

export const revalidate = 60;

export async function generateMetadata() {
  const p = await getLegalPage('terms');
  return { title: p?.title || 'Page' };
}

export default async function Page() {
  const [page, settings] = await Promise.all([getLegalPage('terms'), getSettings()]);
  if (!page) notFound();
  return <LegalPage page={page} settings={settings} />;
}
