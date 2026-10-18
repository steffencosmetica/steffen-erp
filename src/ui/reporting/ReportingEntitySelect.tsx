'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReportingEntityOptionDTO } from '@/actions/reporting.dto';

/**
 * Selector buscable de entidad analítica (DESIGN.md §35.5): combobox mínimo
 * accesible (patrón ARIA combobox + listbox), sin librerías. Filtra por
 * nombre sin distinguir mayúsculas ni acentos; teclado: ↑/↓ mueve, Enter
 * selecciona, Escape cierra. Cerrado muestra la selección actual. Solo ofrece
 * las opciones recibidas (entidades con ventas en el año).
 */

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const ReportingEntitySelect: React.FC<{
  options: readonly ReportingEntityOptionDTO[];
  value: string | null;
  onChange: (entityKey: string) => void;
  disabled?: boolean;
  className?: string;
}> = ({ options, value, onChange, disabled = false, className = '' }) => {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selectedLabel = options.find((o) => o.entityKey === value)?.label ?? '';
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((o) => normalize(o.label).includes(q)) : [...options];
  }, [options, query]);

  const openList = () => {
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.entityKey === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (option: ReportingEntityOptionDTO | undefined) => {
    if (option) onChange(option.entityKey);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (filtered.length === 0 ? 0 : (i + step + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        choose(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const activeId = open && !disabled && filtered[active] ? `${listId}-opt-${active}` : undefined;
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-active="true"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, query]);

  return (
    <div className={`relative min-w-0 ${open ? 'z-20' : ''} ${className}`}>
      <input
        disabled={disabled}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Cliente o canal a analizar"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={open ? query : selectedLabel}
        placeholder={open ? selectedLabel || 'Buscar por nombre' : 'Buscar por nombre'}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        title={selectedLabel}
        autoComplete="off"
        className="h-11 w-full min-w-0 pl-3 pr-9 text-base md:text-sm border border-steffen-border rounded-[5px] focus:outline-none focus:border-steffen-gold focus-visible:ring-1 focus-visible:ring-steffen-gold"
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steffen-muted" />
      {open && !disabled && (
        <ul ref={listRef} id={listId} role="listbox" aria-label="Clientes y canales" className="ui-panel absolute z-20 mt-1 max-h-64 w-full overflow-x-hidden overflow-y-auto overscroll-contain py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-steffen-muted">Sin coincidencias.</li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option.entityKey}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={option.entityKey === value}
                data-active={i === active}
                title={option.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(i)}
                className={`min-h-[44px] [overflow-wrap:anywhere] cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-steffen-gray text-steffen-surface' : 'text-steffen-surface'} ${
                  option.entityKey === value ? 'font-semibold' : ''
                }`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
