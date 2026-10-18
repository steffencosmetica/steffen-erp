'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
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
  className?: string;
}> = ({ options, value, onChange, className = '' }) => {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
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
    inputRef.current?.blur();
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
      close();
    }
  };

  const activeId = open && filtered[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Cliente o canal a analizar"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={open ? query : selectedLabel}
        placeholder={open ? selectedLabel || 'Buscar por nombre' : 'Buscar por nombre'}
        onFocus={openList}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-10 w-full pl-3 pr-9 text-sm border border-steffen-border rounded-[5px] focus:outline-none focus:border-steffen-gold"
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steffen-muted" />
      {open && (
        <ul id={listId} role="listbox" className="ui-panel absolute z-20 mt-1 max-h-64 w-full overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-steffen-muted">Sin coincidencias.</li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option.entityKey}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={option.entityKey === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(i)}
                className={`min-h-[40px] cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-steffen-gray text-steffen-surface' : 'text-steffen-surface'} ${
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
