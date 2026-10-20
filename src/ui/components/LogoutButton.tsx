import { LogOut } from 'lucide-react';

/** Presentación compartida; el form padre conserva logoutAction y su flujo. */
export function LogoutButton({ layout = 'stacked' }: { layout?: 'stacked' | 'inline' }) {
  const stacked = layout === 'stacked';
  return (
    <button
      type="submit"
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className={`ui-logout group flex items-center rounded-[5px] text-steffen-text-secondary transition-colors cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-steffen-gold ${
        stacked ? 'flex-col gap-1.5' : 'w-full h-[34px] justify-center gap-2 text-sm font-semibold'
      }`}
    >
      <span className={stacked ? 'w-[40px] h-[34px] inline-flex items-center justify-center' : 'inline-flex items-center justify-center'}>
        <LogOut aria-hidden className={stacked ? 'w-5 h-5' : 'w-4 h-4'} />
      </span>
      {stacked ? <span className="text-[11px] font-semibold leading-tight text-center">Cerrar<br />sesión</span> : 'Cerrar sesión'}
    </button>
  );
}
