import React, { useMemo, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';

const formatCantidad = (cantidad) =>
  cantidad == null ? '—' : Number(cantidad).toLocaleString('es-UY', { maximumFractionDigits: 3 });

/**
 * Ítems tal como están publicados en la página del llamado (comprasestatales.gub.uy):
 * número, artículo, código, cantidad, unidad, otros datos y características.
 */
const ItemsLlamadoTable = ({ items }) => {
  const [filtro, setFiltro] = useState('');

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.numero, it.nombre, it.codigo_articulo, it.unidad, ...(it.caracteristicas || []).map((c) => `${c.nombre} ${c.valor}`)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, filtro]);

  if (!items?.length) return null;

  return (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-white flex items-center">
          <ListChecks className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" />
          Ítems del llamado ({items.length})
        </h3>
        {items.length > 8 && (
          <label className="relative block sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar ítem, código…"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-slate-300 bg-white text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white"
            />
          </label>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
        Tomados de la página del llamado en comprasestatales.gub.uy.
      </p>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
            <tr className="text-left text-slate-600 dark:text-gray-300">
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Nº</th>
              <th className="px-3 py-2 font-semibold">Artículo</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Código</th>
              <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Cantidad</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">Unidad</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900">
            {visibles.map((it, i) => (
              <tr key={`${it.numero}-${i}`} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="px-3 py-2 font-semibold text-slate-700 dark:text-gray-200 whitespace-nowrap">{it.numero}</td>
                <td className="px-3 py-2 text-slate-700 dark:text-gray-200">
                  <div>{it.nombre}</div>
                  {[...(it.datos || []), ...(it.caracteristicas || [])].length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-gray-400">
                      {(it.datos || []).map((d, j) => (
                        <li key={`d${j}`}><span className="font-medium">{d.nombre}:</span> {d.valor}</li>
                      ))}
                      {(it.caracteristicas || []).map((c, j) => (
                        <li key={`c${j}`}>
                          {c.nombre ? <span className="font-medium">{c.nombre}:</span> : null} {c.valor}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-gray-300 whitespace-nowrap">{it.codigo_articulo || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-gray-200 whitespace-nowrap">{formatCantidad(it.cantidad)}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-gray-300 whitespace-nowrap">{it.unidad || '—'}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Ningún ítem coincide con la búsqueda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ItemsLlamadoTable;
