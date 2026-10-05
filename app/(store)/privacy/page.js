import { notFound } from 'next/navigation';
import LegalPage from '@/components/LegalPage';
import { getLegalPage } from '@/lib/pages.js';
import { getSettings } from '@/lib/settings.js';

export const revalidate = 60;

export async function generateMetadata() {
  const p = await getLegalPage('privacy');
  return { title: p?.title || 'Page' };
}

export default async function Page() {
  const [page, settings] = await Promise.all([getLegalPage('privacy'), getSettings()]);
  if (!page) notFound();
  return <LegalPage page={page} settings={settings} />;
}
