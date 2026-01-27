'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/layout/navbar';

/**
 * RootShell controla o que aparece no layout global.
 * - Em /checkin (e subrotas), oculta a Navbar e NAO aplica o container do admin.
 * - Em /songs/[id]/culto (e subrotas), oculta a Navbar e NAO aplica container (modo visualização).
 * - No restante do app, mantem Navbar + container (como era antes).
 */
export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';

  const isCheckin = pathname === '/checkin' || pathname.startsWith('/checkin/');

  // ✅ Modo CULTO: /songs/:id/culto (ou qualquer coisa dentro)
  // Exemplos:
  // - /songs/69779b59e729cdb9dfcd981a/culto
  // - /songs/69779b59e729cdb9dfcd981a/culto/alguma-coisa (se existir)
  const isCulto =
    pathname.includes('/songs/') &&
    (pathname.endsWith('/culto') || pathname.includes('/culto/'));

  if (isCheckin || isCulto) {
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