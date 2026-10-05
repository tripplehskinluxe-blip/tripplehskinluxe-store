import CartProvider from '@/components/CartProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import WhatsApp from '@/components/WhatsApp';
import { getCategories } from '@/lib/catalog.js';

export default async function StoreLayout({ children }) {
  const categories = await getCategories();
  return (
    <CartProvider>
      <Header categories={categories} />
      <main className="page-in">{children}</main>
      <Footer />
      <BottomNav />
      <WhatsApp />
    </CartProvider>
  );
}
