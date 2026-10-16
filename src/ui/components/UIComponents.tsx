// Core UI Components conforming to COMPONENTS.md & DESIGN.md (sistema dark definitivo, Frame 1.png)

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { X, AlertCircle } from 'lucide-react';
import { ErpIcon } from './ErpIcon';

// Buttons
// Variantes (COMPONENTS.md §4): principal / secundario = PrimaryDark (degradé + Border Button),
// verde = Success, rojo = Danger, azul = Tertiary.
// Los nombres de variante se conservan para no tocar ningún call site.
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'principal' | 'secundario' | 'verde' | 'rojo' | 'azul';
  size?: 'small' | 'large';
  children: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'principal',
  size = 'small',
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 rounded-[5px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-steffen-gold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap';

  // Chico 40 px (B1), Grande 70 px (H3) — DESIGN.md §8.
  const sizeClasses = size === 'large' ? 'h-[50px] px-5 text-lg' : 'h-[30px] px-5 text-sm font-semibold';

  let variantClasses = '';
  switch (variant) {
    case 'principal':
    case 'secundario':
      variantClasses = 'ui-btn-dark';
      break;
    case 'verde':
      variantClasses = 'border border-steffen-green bg-steffen-green text-steffen-surface hover:bg-steffen-green-hover hover:border-steffen-green-hover';
      break;
    case 'rojo':
      variantClasses = 'border border-steffen-red bg-steffen-red text-steffen-surface hover:bg-steffen-red-hover hover:border-steffen-red-hover';
      break;
    case 'azul':
      variantClasses = 'border border-steffen-blue bg-steffen-blue text-steffen-surface hover:bg-steffen-blue-hover hover:border-steffen-blue-hover';
      break;
  }

  return (
    <button className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
};

// Badges
export const StatusBadge: React.FC<{ type: 'URG' | 'POCO_STOCK' | 'OPEN' | 'CLOSED' | 'PENDING' | 'READY'; label?: string }> = ({
  type,
  label,
}) => {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-[5px] text-xs';
  if (type === 'URG') {
    return <span className={`${base} font-semibold bg-steffen-red text-steffen-surface`}>URG PARA PEDIDOS</span>;
  }
  if (type === 'POCO_STOCK') {
    return <span className={`${base} font-semibold text-steffen-gold border border-steffen-gold`}>POCO STOCK</span>;
  }
  if (type === 'OPEN') {
    return <span className={`${base} font-semibold text-steffen-surface bg-steffen-green`}>ABIERTO</span>;
  }
  if (type === 'CLOSED') {
    return <span className={`${base} font-semibold text-steffen-surface bg-steffen-gray`}>CERRADO</span>;
  }
  return <span className={`${base} text-steffen-surface bg-steffen-gray`}>{label || type}</span>;
};

// Form Field Wrapper
export const FormField: React.FC<{
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}> = ({ label, error, hint, children, className = '' }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label className="text-xs font-semibold uppercase tracking-wide text-steffen-surface/85">{label}</label>
    {children}
    {hint && <span className="text-xs text-steffen-muted">{hint}</span>}
    {error && <span className="text-xs text-steffen-red font-medium">{error}</span>}
  </div>
);

// Read-only Field (valor automático, distinguible de un input editable)
export const ReadOnlyField: React.FC<{
  label: string;
  value: string | number;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-semibold uppercase tracking-wide text-steffen-surface/85">{label}</label>
    <div
      className={`h-[30px] px-3 flex items-center rounded-[5px] border border-steffen-gray bg-steffen-gray/55 text-sm ${
        highlight ? 'text-steffen-gold font-semibold' : 'text-steffen-surface'
      }`}
    >
      {value}
    </div>
  </div>
);

// Money Display
export const MoneyDisplay: React.FC<{
  amount: number;
  currency?: string;
  className?: string;
  isGain?: boolean;
}> = ({ amount, currency = 'ARS', className = '', isGain }) => {
  const formatted = Math.round(amount).toLocaleString('es-AR');
  const isNeg = amount < 0;

  return (
    <span
      className={`font-semibold ${
        isGain
          ? amount > 0
            ? 'text-steffen-green'
            : amount < 0
            ? 'text-steffen-red'
            : 'text-steffen-muted'
          : isNeg
          ? 'text-steffen-red'
          : 'text-steffen-surface'
      } ${className}`}
    >
      $ {formatted} {currency !== 'ARS' ? `(${currency})` : ''}
    </span>
  );
};

// Modal / Operation Window (DESIGN.md §11: panel dark radius 10, sin sombras)
export const Modal: React.FC<{
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}> = ({ title, isOpen, onClose, children, maxWidth = 'max-w-3xl' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 overflow-y-auto">
      <div className={`ui-panel w-full ${maxWidth} my-6 max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-steffen-gray">
          <h2 className="text-2xl font-semibold text-steffen-surface">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-[5px] text-steffen-surface/70 hover:text-steffen-surface hover:bg-steffen-gray transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

// Confirm Dialog
export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="bg-steffen-bg rounded-[10px] p-5 max-w-md w-full border border-steffen-red">
        <div className="flex items-center gap-3 text-steffen-red mb-3">
          <AlertCircle className="w-6 h-6" />
          <h3 className="text-lg font-semibold text-steffen-surface">{title}</h3>
        </div>
        <p className="text-sm text-steffen-surface/80 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secundario" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="rojo" onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
};

// ==========================================================================
// Componentes base del rediseño (COMPONENTS.md §5–§8, §19, §20, §61–§64)
// ==========================================================================

// SectionHeader: `Título ———— línea` (Text Muted + Border Contenedor), controles opcionales al extremo.
export const SectionHeader: React.FC<{
  title: string;
  variant?: 'default' | 'alert' | 'strong';
  actions?: ReactNode;
  className?: string;
}> = ({ title, variant = 'default', actions, className = '' }) => {
  const titleColor =
    variant === 'alert' ? 'text-steffen-red' : variant === 'strong' ? 'text-steffen-surface' : 'text-steffen-muted';
  const lineColor = variant === 'alert' ? 'bg-steffen-red' : variant === 'strong' ? 'bg-steffen-surface' : 'bg-steffen-gray';
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 ${className}`}>
      <h2 className={`text-[12px] font-semibold whitespace-nowrap ${titleColor}`}>{title}</h2>
      <span aria-hidden className={`flex-1 min-w-[24px] h-px ${lineColor}`} />
      {actions && <div className="flex flex-wrap items-center gap-3 max-w-full">{actions}</div>}
    </div>
  );
};

// Panel: Secondary + Border Contenedor + radius 10 (COMPONENTS.md §62).
export const Panel: React.FC<{
  children: ReactNode;
  variant?: 'default' | 'alert';
  className?: string;
}> = ({ children, variant = 'default', className = '' }) => (
  <section className={`ui-panel px-5 py-4 ${variant === 'alert' ? '!border-steffen-red' : ''} ${className}`}>{children}</section>
);

// KpiCard: Default (negra + borde dorado), con ícono, o Positiva (verde sólido). COMPONENTS.md §19.
export const KpiCard: React.FC<{
  label: string;
  value: ReactNode;
  variant?: 'default' | 'inverted' | 'positive';
  icon?: ReactNode;
  className?: string;
  /** Estilo opcional del label (p. ej. dorado en Total facturado, Figma Dashboard). */
  labelClassName?: string;
}> = ({ label, value, variant = 'default', icon, className = '', labelClassName = '' }) => {
  const variantClasses =
    variant === 'positive'
      ? 'bg-steffen-green border-steffen-green text-steffen-surface'
      : 'bg-steffen-bg border-steffen-gold text-steffen-surface';
  return (
    <div
      className={`rounded-[10px] border-2 px-4 py-3 flex flex-col items-center justify-center text-center ${variantClasses} ${className}`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[24px] leading-none font-bold tabular-nums">{value}</span>
      </div>
      <span className={`mt-2 text-xs font-semibold uppercase ${labelClassName}`}>{label}</span>
    </div>
  );
};

// IconButton: acción compacta icon-only con label accesible obligatorio (COMPONENTS.md §4.1 Icon).
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: 'secundario' | 'rojo' | 'verde';
  size?: 'small' | 'large';
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  variant = 'secundario',
  size = 'small',
  className = '',
  ...props
}) => {
  const variantClasses =
    variant === 'rojo'
      ? 'border border-steffen-red bg-steffen-red hover:bg-steffen-red-hover'
      : variant === 'verde'
      ? 'border border-steffen-green bg-steffen-green hover:bg-steffen-green-hover'
      : 'ui-btn-dark';
  const sizeClasses = size === 'large' ? 'w-[50px] h-[50px]' : 'w-[30px] h-[30px]';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center shrink-0 rounded-[5px] text-steffen-surface transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
};

// ListItemButton: patrón Lista — transparente; hover/seleccionado con degradé (COMPONENTS.md §7).
interface ListItemButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export const ListItemButton: React.FC<ListItemButtonProps> = ({ selected, icon, children, className = '', ...props }) => (
  <button
    type="button"
    aria-pressed={selected}
    className={`ui-list-item ${/(^|\s)w-/.test(className) ? '' : 'w-full'} flex items-center gap-3 px-4 h-[29px] rounded-[5px] text-sm font-semibold text-left transition-colors cursor-pointer ${className}`}
    {...props}
  >
    {icon}
    <span className="truncate">{children}</span>
  </button>
);

// CreateButton: `+` circular (ícono boton-mas) para crear dentro de una colección visual.
interface CreateButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const CreateButton: React.FC<CreateButtonProps> = ({ label, className = '', ...props }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    className={`inline-flex items-center justify-center w-[66px] h-[66px] rounded-full transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    {...props}
  >
    <ErpIcon name="mas" tone="light" className="w-[66px] h-[66px]" />
  </button>
);

// Enlace de navegación secundaria (`IR A …`, `Ver todas ▸`): Tertiary + triángulo (COMPONENTS.md §8).
export const forwardLinkClass =
  'inline-flex items-center gap-2 text-sm font-semibold text-steffen-blue hover:text-steffen-blue-hover transition-colors';

export const ForwardArrow: React.FC = () => (
  <svg aria-hidden viewBox="0 0 10 12" className="w-3 h-3.5 fill-current">
    <path d="M0 0 L10 6 L0 12 Z" />
  </svg>
);

// BackLink: `◂ Volver` en Tertiary (COMPONENTS.md §8).
export const BackLink: React.FC<{ href: string; label?: string; className?: string }> = ({
  href,
  label = 'Volver',
  className = '',
}) => (
  <Link
    href={href}
    className={`inline-flex items-center gap-2 text-base font-semibold text-steffen-blue hover:text-steffen-blue-hover transition-colors ${className}`}
  >
    <svg aria-hidden viewBox="0 0 10 12" className="w-2.5 h-3 fill-current">
      <path d="M10 0 L0 6 L10 12 Z" />
    </svg>
    {label}
  </Link>
);

// SecondaryHeader: `Volver` · título H3 centrado · acción (COMPONENTS.md §64).
export const SecondaryHeader: React.FC<{
  title: string;
  backHref: string;
  actions?: ReactNode;
  className?: string;
}> = ({ title, backHref, actions, className = '' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-3 items-center gap-4 ${className}`}>
    <BackLink href={backHref} className="justify-self-start" />
    <h1 className="text-lg text-steffen-surface uppercase sm:text-center">{title}</h1>
    <div className="flex items-center gap-3 sm:justify-self-end">{actions}</div>
  </div>
);

// DataTable: clases compartidas del patrón de tabla dark (DESIGN.md §12, COMPONENTS.md §20).
// Encabezado: el fondo va en cada th (no en el tr) para que el radius de 5px recorte en border-collapse.
export const tableStyles = {
  table: 'w-full text-sm text-steffen-surface border-collapse',
  headRow: 'text-steffen-surface font-semibold text-sm [&>th]:bg-steffen-gray [&>th:first-child]:rounded-l-[5px] [&>th:last-child]:rounded-r-[5px]',
  headRowHighlight: 'text-steffen-surface font-semibold text-sm [&>th]:bg-steffen-gold [&>th:first-child]:rounded-l-[5px] [&>th:last-child]:rounded-r-[5px]',
  headRowAlert: 'text-steffen-surface font-semibold text-sm [&>th]:bg-steffen-red [&>th:first-child]:rounded-l-[5px] [&>th:last-child]:rounded-r-[5px]',
  headCell: 'px-5 py-2 text-left',
  row: 'border-b border-steffen-surface/70',
  rowAlert: 'ui-row-alert border-b border-steffen-surface/70',
  cell: 'px-5 py-1.5',
  numericCell: 'px-5 py-1.5 text-right tabular-nums',
} as const;

// IconTile: acción compacta de ícono con label debajo (Figma Dashboard: Acceso rápido / Cuentas).
// Ícono plateado por defecto; hover en dorado cromado como la navegación.
export const IconTile: React.FC<{
  icon: ReactNode;
  label: string;
  title?: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}> = ({ icon, label, title, onClick, href, className = '' }) => {
  const box = (
    <span className="ui-btn-dark w-[50px] h-[50px] inline-flex items-center justify-center rounded-[5px] transition-colors">
      {icon}
    </span>
  );
  const caption = (
    <span className="ui-nav-label text-[11px] leading-tight text-center text-steffen-surface/85 max-w-[64px]">{label}</span>
  );
  const classes = `group ui-nav-item inline-flex flex-col items-center gap-1.5 cursor-pointer ${className}`;
  return href ? (
    <Link href={href} title={title ?? label} className={classes}>
      {box}
      {caption}
    </Link>
  ) : (
    <button type="button" onClick={onClick} title={title ?? label} className={classes}>
      {box}
      {caption}
    </button>
  );
};
