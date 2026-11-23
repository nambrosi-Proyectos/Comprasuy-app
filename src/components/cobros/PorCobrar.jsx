import React from 'react';
import { AlertTriangle, Building2, User } from 'lucide-react';
import { textoTotales } from '@/lib/pagos';

const Tarjeta = ({ icon: Icon, titulo, valor, detalle, tono, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border p-4 transition-colors ${onClick ? 'hover:border-brand cursor-pointer' : 'cursor-default'} ${tono}`}
  >
    <span className="text-[13px] font-semibold flex items-center gap-1.5"><Icon className="h-4 w-4" /> {titulo}</span>
    <b className="block text-xl mt-1 tabular-nums">{valor}</b>
    {detalle && <p className="text-xs mt-1 opacity-75">{detalle}</p>}
  </button>
);

const cuantas = (n) => `${n} ${n === 1 ? 'factura' : 'facturas'}`;

/** Lo que falta cobrar por cuenta (Comprasuy SAS / Nicolás Ambrosi) y lo vencido hace más de 90 días. */
const PorCobrar = ({ resumen, pendientes, onIr }) => {
  const de = (emisor) => pendientes.filter((p) => p.emisor === emisor).length;
  const vencidas = pendientes.filter((p) => p.dias > 90).length;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Tarjeta icon={Building2} titulo="Por cobrar · Comprasuy SAS" valor={textoTotales(resumen.porEmisor.comprasuy || {})} detalle={cuantas(de('comprasuy'))} tono="bg-white border-slate-200 text-ink" onClick={onIr && (() => onIr('comprasuy'))} />
      <Tarjeta icon={User} titulo="Por cobrar · Nicolás Ambrosi" valor={textoTotales(resumen.porEmisor.nicolas || {})} detalle={cuantas(de('nicolas'))} tono="bg-white border-slate-200 text-ink" onClick={onIr && (() => onIr('nicolas'))} />
      <Tarjeta icon={AlertTriangle} titulo="Hace más de 90 días" valor={textoTotales(resumen.vencido90)} detalle={cuantas(vencidas)} tono={vencidas ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900'} onClick={onIr && (() => onIr('vencidas'))} />
    </div>
  );
};

export default PorCobrar;
