import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Прогнози — Елитна група U17',
  description:
    'Прогнози за резултатите от мачовете на Елитна група (U-17): първо полувреме и краен резултат.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
