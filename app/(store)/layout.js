import CartProvider from '@/components/CartProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import WhatsApp from '@/components/WhatsApp';
import { getCategories } from '@/lib/catalog.js';
import { getSettings } from '@/lib/settings.js';
import { activeFestive } from '@/lib/festive.js';
import FestiveDecor from '@/components/FestiveDecor.js';

export default async function StoreLayout({ children }) {
  const categories = await getCategories();
  const settings = await getSettings();
  const theme = activeFestive(settings.festive);
  return (
    <CartProvider>
      <div className={theme ? `festive festive-${theme}` : undefined}>
        <FestiveDecor theme={theme} name={settings.store?.name} />
        <Header categories={categories} />
        <main>{children}</main>
        <Footer />
        <BottomNav />
        <WhatsApp />
      </div>
    </CartProvider>
  );
}
