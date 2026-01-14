import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/navbar';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  title: 'Gestão de Membros da Igreja',
  description: 'Sistema de gestão de membros e envio de emails para igreja',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Gestão de Membros da Igreja',
    description: 'Sistema de gestão de membros e envio de emails para igreja',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="light" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
        <meta name="color-scheme" content="light only" />
      </head>
      <body className={`${inter.className} bg-gray-50 min-h-screen`} suppressHydrationWarning>
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <Toaster position="top-right" />
        <style dangerouslySetInnerHTML={{ __html: `
          [data-hydration-error] { display: none !important; }
          :root { color-scheme: light only; }
          html { color-scheme: light !important; }
        ` }} />
      </body>
    </html>
  );
}
