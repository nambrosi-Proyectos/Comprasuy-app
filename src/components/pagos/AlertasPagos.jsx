import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock, CalendarDays, Landmark } from 'lucide-react';
import { fechaCorta, formatoMonto, hoyISO, sumarDias, textoTotales, totalesPorMoneda } from '@/lib/pagos';

/** Agrupa cheques pendientes por fecha de débito y depósitos sin pagar. */
export const calcularAlertas = (cheques, depositos) => {
  const hoy = hoyISO();
  const manana = sumarDias(hoy, 1);
  const limite = sumarDias(hoy, 7);
  const pendientes = cheques.filter((c) => c.estado === 'pendiente' && c.fecha_pago);
  return {
    hoy: pendientes.filter((c) => c.fecha_pago <= hoy), // incluye los vencidos sin marcar
    manana: pendientes.filter((c) => c.fecha_pago === manana),
    proximos: pendientes.filter((c) => c.fecha_pago > manana && c.fecha_pago <= limite),
    depositos: depositos.filter((d) => !d.pagado),
    hoyIso: hoy,
  };
};

const Tarjeta = ({ icon: Icon, titulo, filas, tono, vacio, onClick, mostrarFecha, hoyIso }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border p-4 transition-colors hover:border-brand ${tono} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-semibold flex items-center gap-1.5"><Icon className="h-4 w-4" /> {titulo}</span>
      <span className="text-xs font-bold rounded-full bg-white/70 px-2 py-0.5">{filas.length}</span>
    </div>
    <b className="block text-xl mt-1 tabular-nums">{filas.length ? textoTotales(totalesPorMoneda(filas)) : '—'}</b>
    {filas.length === 0 ? (
      <p className="text-xs mt-1 opacity-70">{vacio}</p>
    ) : (
      <ul className="mt-2 space-y-0.5 text-xs">
        {filas.slice(0, 4).map((f) => (
          <li key={f.id} className="flex justify-between gap-2">
            <span className="truncate">
              {f.proveedor}
              {mostrarFecha && f.fecha_pago && <span className="opacity-70"> · {f.fecha_pago < hoyIso ? 'vencido ' : ''}{fechaCorta(f.fecha_pago)}</span>}
            </span>
            <span className="tabular-nums font-semibold whitespace-nowrap">{formatoMonto(f.monto, f.moneda)}</span>
          </li>
        ))}
        {filas.length > 4 && <li className="opacity-70">y {filas.length - 4} más…</li>}
      </ul>
    )}
  </button>
);

const AlertasPagos = ({ cheques, depositos, onIr }) => {
  const a = useMemo(() => calcularAlertas(cheques, depositos), [cheques, depositos]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <Tarjeta icon={AlertTriangle} titulo="Cheques que se debitan HOY" filas={a.hoy} tono="bg-red-50 border-red-200 text-red-900" vacio="No hay cheques para hoy." onClick={onIr && (() => onIr('cheques'))} mostrarFecha hoyIso={a.hoyIso} />
      <Tarjeta icon={CalendarClock} titulo="Cheques de MAÑANA" filas={a.manana} tono="bg-amber-50 border-amber-200 text-amber-900" vacio="No hay cheques para mañana." onClick={onIr && (() => onIr('cheques'))} />
      <Tarjeta icon={CalendarDays} titulo="Próximos 7 días" filas={a.proximos} tono="bg-sky-50 border-sky-200 text-sky-900" vacio="Sin vencimientos esta semana." onClick={onIr && (() => onIr('cheques'))} mostrarFecha hoyIso={a.hoyIso} />
      <Tarjeta icon={Landmark} titulo="Depósitos pendientes de pago" filas={a.depositos} tono="bg-white border-slate-200 text-ink" vacio="Todos los depósitos están pagados." onClick={onIr && (() => onIr('depositos'))} />
    </div>
  );
};

export default AlertasPagos;
