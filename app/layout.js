import './globals.css';
import { Fraunces, Figtree } from 'next/font/google';
import SettingsProvider from '@/components/SettingsProvider';
import { getSettings } from '@/lib/settings.js';

const serif = Fraunces({ subsets: ['latin'], variable: '--font-serif' });
const sans = Figtree({ subsets: ['latin'], variable: '--font-sans' });

export async function generateMetadata() {
  const { store } = await getSettings();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
    title: { default: `${store.name} — ${store.tagline}`, template: `%s · ${store.name}` },
    description: 'Skincare, body care, hair care, fragrance and spa essentials, delivered across Nigeria.',
    openGraph: { title: store.name, description: store.tagline, type: 'website' },
  };
}
export const viewport = { themeColor: '#4b1f75', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }) {
  const settings = await getSettings();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body><SettingsProvider settings={settings}>{children}</SettingsProvider></body>
    </html>
  );
}
