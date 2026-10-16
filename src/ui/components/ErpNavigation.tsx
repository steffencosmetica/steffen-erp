'use client';

import React from 'react';
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
const shortcutItems: { name: string; href: string; icon: ErpIconName }[] = [
  { name: 'Clientes', href: '/clientes', icon: 'usuario' },
  { name: 'Proveedores', href: '/proveedores', icon: 'compra' },
  { name: 'Precios', href: '/precios', icon: 'lista-precios' },
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
          isActive={pathname.startsWith(item.href)}
        />
      ))}
    </nav>
  );
};

/** Navegación compacta para pantallas angostas (responsive final: Fase 18). */
export const ErpNavMobile: React.FC = () => {
  const pathname = usePathname();

  return (
    <div className="lg:hidden flex gap-1 px-4 py-2 border-b border-steffen-gray overflow-x-auto scrollbar-none bg-steffen-bg">
      {navItems.map((item) => {
        const isActive = isItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap rounded-[5px] ${
              isActive ? 'text-steffen-gold ui-degrade' : 'text-steffen-muted'
            }`}
          >
            <ErpIcon name={item.icon} tone={isActive ? 'gold' : 'chrome'} className="w-4 h-4" />
            {item.name}
          </Link>
        );
      })}
    </div>
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
