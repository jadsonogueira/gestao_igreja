'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/layout/navbar';

/**
 * RootShell controla o que aparece no layout global.
 * - Em /checkin (e subrotas), oculta a Navbar e NAO aplica o container do admin.
 * - No restante do app, mantem Navbar + container (como era antes).
 */
export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';

  const isCheckin = pathname === '/checkin' || pathname.startsWith('/checkin/');

  if (isCheckin) {
    // Sem Navbar e sem container do admin
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </>
  );
}
