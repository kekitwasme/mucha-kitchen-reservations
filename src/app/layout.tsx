import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Image from 'next/image';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mucha Kitchen Table Reservations',
  description: 'Table management and booking system',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <header className="border-b bg-white">
            <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
              <Image src="/logo.png" alt="Mucha Kitchen" width={36} height={36} className="h-9 w-9" />
              <span className="text-lg font-bold">Mucha Kitchen Reservations</span>
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
