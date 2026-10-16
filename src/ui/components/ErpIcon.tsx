import React from 'react';

/**
 * Íconos base del rediseño (docs/visual-references/iconos/, copiados a public/icons/).
 * No se redibujan: se usa la silueta del PNG como máscara y se le aplica el
 * color/estilo del sistema (COMPONENTS.md §63).
 */
export type ErpIconName =
  | 'dashboard'
  | 'fabrica'
  | 'pedido'
  | 'stock'
  | 'admin'
  | 'compra'
  | 'formula'
  | 'envase'
  | 'lista-precios'
  | 'gasto'
  | 'retiro'
  | 'orden'
  | 'ingresos'
  | 'productos'
  | 'materia-prima'
  | 'tanque'
  | 'usuario'
  | 'nueva-cuenta'
  | 'mas';

/** chrome: plateado (botones, nav inactiva) · gold: Primary · light: Surface · muted · red · dark · original: PNG sin máscara. */
export type ErpIconTone = 'chrome' | 'gold' | 'light' | 'muted' | 'red' | 'dark' | 'original';

interface ErpIconProps {
  name: ErpIconName;
  tone?: ErpIconTone;
  /** Clases de tamaño (por defecto 24 px). */
  className?: string;
}

export const ErpIcon: React.FC<ErpIconProps> = ({ name, tone = 'chrome', className = 'w-6 h-6' }) => {
  const src = `/icons/${name}.png`;

  if (tone === 'original') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden className={`shrink-0 object-contain ${className}`} />;
  }

  return (
    <span
      aria-hidden
      className={`ui-icon ui-icon--${tone} ${className}`}
      style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }}
    />
  );
};
