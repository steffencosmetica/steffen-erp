import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tema activo: solo dark (DESIGN.md §4.2). El modo light futuro cambia este atributo.
  return (
    <html lang="es" data-theme="dark" className={inter.variable}>
      <body className="erp-dark min-h-screen bg-steffen-page text-steffen-surface antialiased">
        {children}
      </body>
    </html>
  );
}
