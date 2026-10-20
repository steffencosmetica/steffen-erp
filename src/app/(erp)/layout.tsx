import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import { UNAUTHORIZED_LOGIN_ERROR } from '@/auth/auth-routing';
import { logoutAction } from '@/actions/auth.actions';
import { LogoutButton } from '@/ui/components/LogoutButton';
import { SteffenLogoIcon } from '@/ui/components/SteffenLogo';
import { ErpSidebarNav, ErpNavMobile, ErpPageHeader } from '@/ui/components/ErpNavigation';

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }
  // Sesión de otro usuario: /login la cierra y queda estable (nunca rebota a /).
  if (!isUserAuthorized(user)) {
    redirect(`/login?error=${UNAUTHORIZED_LOGIN_ERROR}`);
  }

  return (
    <div className="min-h-screen bg-steffen-page text-steffen-surface flex font-sans antialiased">
      {/* Desktop (>= 1280): barra lateral con logo, módulos, accesos y logout separado (DESIGN.md §9.0) */}
      <aside className="hidden xl:flex sticky top-0 h-screen w-[78px] shrink-0 bg-steffen-panel flex-col items-center py-6 overflow-y-auto">
        <Link href="/" className="mb-8 transition-opacity hover:opacity-90" title="Steffen ERP">
          <SteffenLogoIcon className="w-9 h-12" />
        </Link>

        <ErpSidebarNav />

        {/* Cerrar sesión: misma lógica (logoutAction); icono y label sin card ni gradiente. */}
        <form action={logoutAction} className="mt-auto pt-6">
          <LogoutButton />
        </form>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Tablet / mobile (< 1280): barra superior + drawer con todos los accesos */}
        <ErpNavMobile logo={<SteffenLogoIcon className="w-6 h-8" />} logoutAction={logoutAction} />

        <main className="flex-1 w-full min-w-0 px-4 md:px-6 xl:px-14 py-5 xl:py-8">
          <ErpPageHeader sessionLabel="Admin" sessionTitle={user.email} />
          {children}
        </main>
      </div>
    </div>
  );
}
