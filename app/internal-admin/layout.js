import AdminProvider from '@/components/admin/AdminProvider';

// Neutral title and no-index: nothing here should be discoverable.
export const metadata = { title: 'Team', robots: { index: false, follow: false, nocache: true } };

export default function AdminLayout({ children }) {
  return <AdminProvider>{children}</AdminProvider>;
}
