'use client';

import React, { useEffect, useId, useRef } from 'react';
import { Button } from '@/ui/components/UIComponents';

export function UnsavedOrderDialog({ variant, onSave, onDiscard, onKeep, purpose = 'navigate' }: {
  variant: 'abandon' | 'continue'; onSave: () => void; onDiscard: () => void; onKeep: () => void;
  purpose?: 'navigate' | 'logout';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current!;
    const buttons = () => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    buttons().at(-1)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onKeep(); }
      if (event.key === 'Tab') {
        const options = buttons();
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        options[(index + (event.shiftKey ? -1 : 1) + options.length) % options.length]?.focus();
      }
    };
    root.addEventListener('keydown', keydown);
    return () => { root.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [onKeep]);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-steffen-overlay">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title} aria-describedby={description}
      className="ui-panel w-full max-w-lg p-5 text-steffen-surface">
      <h3 id={title} className="text-lg font-semibold mb-3">Cambios pendientes</h3>
      <p id={description} className="text-sm text-steffen-muted mb-5">Hay cambios sin guardar o datos pendientes en Agregar producto.</p>
      <div className="flex flex-wrap justify-end gap-3">
        {variant === 'continue' && <Button variant="principal" onClick={onSave}>{purpose === 'logout' ? 'Guardar y cerrar sesión' : 'Guardar y continuar'}</Button>}
        <Button variant="secundario" onClick={onDiscard}>{purpose === 'logout' ? 'Descartar cambios y cerrar sesión' : 'Descartar cambios'}</Button>
        <Button variant="secundario" onClick={onKeep}>Seguir editando</Button>
      </div>
    </div>
  </div>;
}
