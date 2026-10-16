import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { logoutAction } from '@/actions/auth.actions';
import { LogOut } from 'lucide-react';
import { SteffenLogoIcon } from '@/ui/components/SteffenLogo';
import { ErpSidebarNav, ErpNavMobile, ErpPageHeader } from '@/ui/components/ErpNavigation';

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user || !isUserAuthorized(user)) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-steffen-page text-steffen-surface flex font-sans antialiased">
      {/* Barra lateral: logo, módulos y logout separado al pie (DESIGN.md §9.0) */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-[78px] shrink-0 bg-steffen-bg flex-col items-center py-8">
        <Link href="/" className="mb-12 transition-opacity hover:opacity-90" title="Steffen ERP">
          <SteffenLogoIcon className="w-9 h-12" />
        </Link>

        <ErpSidebarNav />

        <form action={logoutAction} className="mt-auto">
          <button
            type="submit"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="ui-btn-dark w-[51px] h-[30px] inline-flex items-center justify-center rounded-[5px] cursor-pointer"
          >
            <LogOut className="w-6 h-6 text-steffen-surface/80" />
          </button>
        </form>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden flex items-center justify-between px-4 h-[42px] bg-steffen-bg">
          <Link href="/" title="Steffen ERP">
            <SteffenLogoIcon className="w-7 h-9" />
          </Link>
          <form action={logoutAction}>
            <button type="submit" aria-label="Cerrar sesión" className="p-2 text-steffen-surface/80 cursor-pointer">
              <LogOut className="w-5 h-5" />
            </button>
          </form>
        </div>
        <ErpNavMobile />

        <main className="flex-1 w-full px-5 lg:px-14 py-8">
          <ErpPageHeader sessionLabel="Admin" sessionTitle={user.email} />
          {children}
        </main>
      </div>
    </div>
  );
}
