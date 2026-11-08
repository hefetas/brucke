import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/components/AppProvider';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: { default: 'DilYolu', template: '%s · DilYolu' },
  description: 'Kişisel, tamamen ücretsiz İngilizce ve Almanca çalışma alanı.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <AppProvider>
          <Nav />
          <main className="shell">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
