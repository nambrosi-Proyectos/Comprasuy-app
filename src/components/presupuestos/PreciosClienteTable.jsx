import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

// "2026-11-05" → "05/11/2026" (sin pasar por Date, para que no corra un día por la zona horaria).
const fechaCorta = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/** Productos que se le vendieron al cliente, con el último precio (sin IVA) y la fecha de esa venta. */
const PreciosClienteTable = ({ cliente, productos }) => {
  const [query, setQuery] = useState('');
  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => `${p.nombre} ${p.codigo || ''}`.toLowerCase().includes(q));
  }, [productos, query]);

  if (!cliente) return null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">{cliente.name}</h2>
          <p className="text-sm text-slate-500">
            {cliente.cuit ? `RUT ${cliente.cuit} · ` : ''}
            {productos.length} {productos.length === 1 ? 'producto' : 'productos'} con precio
          </p>
        </div>
        {productos.length > 8 && (
          <label className="relative block sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto o código…"
              className="h-9 w-full rounded-lg border border-slate-300 pl-8 pr-2 text-sm outline-none focus:border-brand"
            />
          </label>
        )}
      </div>

      {productos.length === 0 ? (
        <p className="text-sm text-slate-500">Este cliente todavía no tiene precios cargados.</p>
      ) : (
        <div className="max-h-[26rem] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right">Precio s/IVA</th>
                <th className="px-3 py-2 text-center">IVA</th>
                <th className="px-3 py-2 text-right">Precio c/IVA</th>
                <th className="px-3 py-2 text-center">Última venta</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const precio = Number(p.precio_unitario) || 0;
                const iva = Number(p.iva ?? 22);
                return (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500 tabular-nums">{p.codigo}</td>
                    <td className="px-3 py-2 font-medium text-ink">{p.nombre}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(precio, p.moneda || 'UYU')}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{iva}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(precio * (1 + iva / 100), p.moneda || 'UYU')}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{fechaCorta(p.fecha_ultima_venta)}</td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PreciosClienteTable;
