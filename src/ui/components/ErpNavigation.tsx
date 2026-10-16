'use client';

import React, { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ErpIcon, type ErpIconName } from './ErpIcon';

interface NavItem {
  name: string;
  href: string;
  icon: ErpIconName;
  /** Título del encabezado de pantalla principal (DESIGN.md §9.0). */
  pageTitle: string;
}

// Rutas funcionales vigentes (DESIGN.md §9): exactamente 5 módulos principales.
const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: 'dashboard', pageTitle: 'Dashboard' },
  { name: 'Mi Fabrica', href: '/fabrica', icon: 'fabrica', pageTitle: 'Mi Fabrica' },
  { name: 'Pedidos', href: '/pedidos', icon: 'pedido', pageTitle: 'Pedidos' },
  { name: 'Stock', href: '/stock', icon: 'stock', pageTitle: 'Stock' },
  { name: 'Admin', href: '/administracion', icon: 'admin', pageTitle: 'Administración' },
];

/**
 * Módulo padre activo para la ruta actual. Las pantallas secundarias mantienen
 * resaltado su módulo padre (DESIGN.md §9): /formulas y /costo-ganancia →
 * Mi Fábrica; /clientes, /proveedores, /precios y /system-status → Administración.
 */
function isItemActive(item: NavItem, pathname: string): boolean {
  switch (item.href) {
    case '/':
      return pathname === '/';
    case '/fabrica':
      return (
        pathname.startsWith('/fabrica') ||
        pathname.startsWith('/formulas') ||
        pathname.startsWith('/costo-ganancia')
      );
    case '/pedidos':
      return pathname.startsWith('/pedidos');
    case '/stock':
      return (
        pathname.startsWith('/stock') ||
        pathname.startsWith('/materias-primas') ||
        pathname.startsWith('/componentes') ||
        pathname.startsWith('/productos')
      );
    case '/administracion':
      return (
        pathname.startsWith('/administracion') ||
        pathname.startsWith('/clientes') ||
        pathname.startsWith('/proveedores') ||
        pathname.startsWith('/precios') ||
        pathname.startsWith('/system-status')
      );
    default:
      return false;
  }
}

/**
 * Accesos directos a pantallas secundarias existentes (sin rutas ni funciones nuevas).
 * Se resaltan solo en su propia ruta; ADMIN mantiene su regla de activo.
 */
const shortcutItems: { name: string; href: string; icon: ErpIconName; alsoActiveOn?: string[] }[] = [
  { name: 'Clientes', href: '/clientes', icon: 'usuario' },
  { name: 'Proveedores', href: '/proveedores', icon: 'compra' },
  { name: 'Precios', href: '/precios', icon: 'lista-precios' },
  { name: 'Reportes', href: '/reportes', icon: 'ingresos', alsoActiveOn: ['/ventas'] },
];

const SidebarLink: React.FC<{ href: string; icon: ErpIconName; name: string; isActive: boolean }> = ({
  href,
  icon,
  name,
  isActive,
}) => (
  <Link
    href={href}
    aria-current={isActive ? 'page' : undefined}
    className="ui-nav-item w-full flex flex-col items-center gap-1.5 py-1"
  >
    <ErpIcon name={icon} tone={isActive ? 'gold' : 'chrome'} className="w-7 h-7" />
    <span className={`ui-nav-label text-[11px] font-semibold ${isActive ? 'text-steffen-gold' : 'text-steffen-muted'}`}>
      {name}
    </span>
  </Link>
);

/**
 * Barra lateral (DESIGN.md §9.0): ícono + label en columna; el módulo activo en
 * Primary, el resto plateado con label Text Muted; hover en dorado cromado.
 */
export const ErpSidebarNav: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav aria-label="Módulos" className="flex flex-col items-center gap-5 w-full">
      {navItems.map((item) => (
        <SidebarLink
          key={item.href}
          href={item.href}
          icon={item.icon}
          name={item.name}
          isActive={isItemActive(item, pathname)}
        />
      ))}

      <span aria-hidden className="w-10 h-px bg-steffen-gray" />

      {shortcutItems.map((item) => (
        <SidebarLink
          key={item.href}
          href={item.href}
          icon={item.icon}
          name={item.name}
          isActive={[item.href, ...(item.alsoActiveOn ?? [])].some((h) => pathname.startsWith(h))}
        />
      ))}
    </nav>
  );
};

/**
 * Navegación tablet/mobile (< 1280 px, DESIGN.md §3.5): barra superior con logo,
 * módulo actual y botón menú; drawer lateral con TODOS los accesos (5 módulos,
 * accesos rápidos y logout). No oculta funciones por tamaño.
 */
export const ErpNavMobile: React.FC<{ logo: React.ReactNode; logoutAction: () => Promise<void> }> = ({
  logo,
  logoutAction,
}) => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Cerrar al navegar y con Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current =
    navItems.find((it) => isItemActive(it, pathname))?.pageTitle ??
    shortcutItems.find((it) => [it.href, ...(it.alsoActiveOn ?? [])].some((h) => pathname.startsWith(h)))?.name ??
    '';

  const linkClass = (active: boolean) =>
    `ui-nav-item flex items-center gap-3 px-3 h-[38px] rounded-[5px] text-sm font-semibold ${
      active ? 'ui-degrade' : ''
    }`;

  return (
    <>
      <div className="xl:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-[48px] bg-steffen-bg border-b border-steffen-gray">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="erp-mobile-drawer"
          className="ui-btn-dark w-[36px] h-[30px] inline-flex items-center justify-center rounded-[5px] cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" title="Steffen ERP" className="shrink-0">
          {logo}
        </Link>
        <span className="text-sm font-semibold text-steffen-gold truncate">{current}</span>
      </div>

      {open && (
        <div className="xl:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menú">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 cursor-default"
          />
          <nav
            id="erp-mobile-drawer"
            aria-label="Módulos"
            className="absolute left-0 top-0 h-full w-[260px] max-w-[85vw] bg-steffen-bg border-r border-steffen-gray flex flex-col px-3 py-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4 px-1">
              <Link href="/" title="Steffen ERP">
                {logo}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const active = isItemActive(item, pathname);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
                    <ErpIcon name={item.icon} tone={active ? 'gold' : 'chrome'} className="w-6 h-6" />
                    <span className={`ui-nav-label ${active ? 'text-steffen-gold' : 'text-steffen-surface'}`}>{item.pageTitle}</span>
                  </Link>
                );
              })}
            </div>

            <span aria-hidden className="my-3 h-px bg-steffen-gray" />

            <div className="flex flex-col gap-1">
              {shortcutItems.map((item) => {
                const active = [item.href, ...(item.alsoActiveOn ?? [])].some((h) => pathname.startsWith(h));
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
                    <ErpIcon name={item.icon} tone={active ? 'gold' : 'chrome'} className="w-6 h-6" />
                    <span className={`ui-nav-label ${active ? 'text-steffen-gold' : 'text-steffen-surface'}`}>{item.name}</span>
                  </Link>
                );
              })}
            </div>

            <form action={logoutAction} className="mt-auto pt-4">
              <button
                type="submit"
                className="group ui-btn-dark w-full h-[34px] inline-flex items-center justify-center gap-2 rounded-[5px] text-sm font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-steffen-silver group-hover:text-steffen-gold transition-colors" />
                Cerrar sesión
              </button>
            </form>
          </nav>
        </div>
      )}
    </>
  );
};

/**
 * Encabezado de pantalla principal (COMPONENTS.md §64): título H1, chip de
 * sesión y línea inferior. Las pantallas secundarias usan su propio
 * SecondaryHeader (Volver + título), por eso aquí no se renderiza.
 */
export const ErpPageHeader: React.FC<{ sessionLabel: string; sessionTitle?: string }> = ({
  sessionLabel,
  sessionTitle,
}) => {
  const pathname = usePathname();
  const item = navItems.find((it) => (it.href === '/' ? pathname === '/' : pathname === it.href));
  if (!item) return null;

  return (
    <div className="flex items-center justify-between gap-4 pb-4 mb-6 border-b border-steffen-gray">
      <h1 className="text-[22px] leading-tight font-bold text-steffen-surface">{item.pageTitle}</h1>
      <span
        title={sessionTitle}
        className="ui-btn-dark inline-flex items-center h-[26px] px-5 rounded-[5px] text-sm font-semibold"
      >
        {sessionLabel}
      </span>
    </div>
  );
};
