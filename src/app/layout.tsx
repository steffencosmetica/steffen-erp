import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { normalizeTheme, THEME_COOKIE_NAME } from '@/lib/theme';
import { ThemeProvider } from '@/ui/components/ThemeProvider';
import './globals.css';

// Tipografía del sistema (DESIGN.md §5): Inter.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Steffen ERP',
  description: 'Sistema de gestión integral para Steffen Cosmética Capilar: stock, formulaciones, compras, pedidos, remitos y finanzas.',
  openGraph: {
    title: 'Steffen ERP',
    description: 'Sistema de gestión integral para Steffen Cosmética Capilar: stock, formulaciones, compras, pedidos, remitos y finanzas.',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = normalizeTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  return (
    <html lang="es" data-theme={initialTheme} className={inter.variable}>
      <body className="min-h-screen bg-steffen-background text-steffen-text-primary antialiased">
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
