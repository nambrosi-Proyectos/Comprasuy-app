import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Selector con casillas para elegir varias opciones a la vez (ej. organismos).
 * Lista con scroll, buscador interno y botones para marcar los visibles o limpiar.
 * `selected` vacío significa "todos".
 */
const MultiSelectFilter = ({
  options,
  selected,
  onChange,
  counts = {},
  allLabel = 'Todos',
  pluralLabel = 'seleccionados',
  searchPlaceholder = 'Buscar…',
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (option) => {
    const next = new Set(selectedSet);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(options.filter((o) => next.has(o)));
  };

  const marcarVisibles = () => {
    const next = new Set(selectedSet);
    visibles.forEach((o) => next.add(o));
    onChange(options.filter((o) => next.has(o)));
  };

  const label =
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} ${pluralLabel}`;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(''); }}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={`flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-white px-3 text-sm text-left disabled:opacity-50 ${className}`}
        >
          <span className={`truncate ${selected.length ? 'font-semibold text-ink' : ''}`}>{label}</span>
          <span className="flex items-center gap-1 shrink-0">
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Quitar filtro"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}
                className="rounded p-0.5 text-slate-400 hover:text-ink hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,420px)] p-0 rounded-xl">
        <div className="p-2 border-b border-slate-200">
          <label className="relative block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-slate-300 pl-8 pr-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs border-b border-slate-200">
          <button type="button" onClick={marcarVisibles} className="font-semibold text-brand-dark hover:underline">
            Marcar {query ? 'los encontrados' : 'todos'}
          </button>
          <span className="text-slate-500">{selected.length ? `${selected.length} marcados` : 'Sin filtro: se ven todos'}</span>
          <button type="button" onClick={() => onChange([])} className="font-semibold text-slate-600 hover:underline" disabled={!selected.length}>
            Limpiar
          </button>
        </div>
        <ul className="max-h-72 overflow-y-auto overscroll-contain py-1" role="listbox" aria-multiselectable="true">
          {visibles.map((option) => {
            const checked = selectedSet.has(option);
            return (
              <li key={option}>
                <label className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm hover:bg-slate-100 ${checked ? 'bg-brand-light/60' : ''}`}>
                  <Checkbox checked={checked} onCheckedChange={() => toggle(option)} className="mt-0.5" />
                  <span className="flex-1 leading-snug">{option}</span>
                  {counts[option] != null && <span className="text-xs text-slate-400 tabular-nums">{counts[option]}</span>}
                </label>
              </li>
            );
          })}
          {visibles.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">Sin resultados.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelectFilter;
