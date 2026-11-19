import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Building, DollarSign, ExternalLink, Database, UserCheck, DownloadCloud, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const AdjudicacionCard = ({ adjudicacion, index, onSaveToDb, onViewOriginal, onFetchDetails, isFetchingDetails }) => {
  
  const getProveedor = () => {
    const match = adjudicacion.titulo.match(/Adjudicaci.n (?:de|a|del) (.+)/i);
    if(match && match[1]) {
      const parts = match[1].split(' - ');
      return parts[0];
    }
    return adjudicacion.adjudicado_items?.[0]?.proveedor || 'No especificado';
  };
  
  const proveedorDisplay = getProveedor();

  const getMonto = () => {
    if (typeof adjudicacion.monto === 'number') {
      return formatCurrency(adjudicacion.monto);
    }
    const montoMatch = adjudicacion.descripcion_completa.match(/Monto: ([\d.,]+)/);
    if(montoMatch && montoMatch[1]) {
        const monto = parseFloat(montoMatch[1].replace(/\./g, '').replace(',', '.'));
        const monedaMatch = adjudicacion.descripcion_completa.match(/Moneda: ([A-ZÁÉÍÓÚ\s]+)/);
        const moneda = monedaMatch && monedaMatch[1] ? (monedaMatch[1].includes('DÓLARES') ? 'USD' : 'UYU') : 'UYU';
        return formatCurrency(monto, moneda);
    }
    return 'No especificado';
  }

  const montoDisplay = getMonto();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl transition-all duration-300 hover:border-slate-300"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1">
          <div className="mb-3">
              <h3 className="text-xl font-bold text-slate-800 mb-2">{adjudicacion.titulo}</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="flex items-center"><Building className="w-3 h-3 mr-1.5 text-blue-500" />{adjudicacion.organismo}</Badge>
                <Badge variant="outline" className="flex items-center font-semibold text-teal-700 border-teal-200"><UserCheck className="w-3 h-3 mr-1.5 text-teal-500" />{proveedorDisplay}</Badge>
              </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mb-4 text-slate-600">
            <div className="flex items-center col-span-1 md:col-span-2"><DollarSign className="w-4 h-4 mr-2 text-green-500" /><span className="text-lg font-bold text-green-600">{montoDisplay}</span></div>
            <div className="flex items-center"><Calendar className="w-4 h-4 mr-2 text-purple-500" /><span className="text-sm">Publicado: {formatDate(adjudicacion.fecha_publicacion)}</span></div>
            <div className="flex items-center"><Clock className="w-4 h-4 mr-2 text-gray-500" /><span className="text-sm">Modificado: {formatDate(adjudicacion.fecha_modificacion)}</span></div>
          </div>
          
          <p className="text-slate-500 text-sm mb-4 line-clamp-2" dangerouslySetInnerHTML={{ __html: adjudicacion.descripcion_completa }} />
        </div>
        
        <div className="flex flex-wrap gap-3 lg:ml-6 lg:flex-col lg:items-end lg:justify-start flex-shrink-0">
          <Button onClick={() => onFetchDetails(adjudicacion)} variant="outline" className="border-cyan-500 text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700" disabled={isFetchingDetails}>
            <DownloadCloud className={`w-4 h-4 mr-2 ${isFetchingDetails ? 'animate-spin' : ''}`} />
            {isFetchingDetails ? 'Cargando...' : 'Cargar Detalles'}
          </Button>
          <Button onClick={() => onSaveToDb(adjudicacion)} variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700">
            <Database className="w-4 h-4 mr-2" />
            Guardar Adjudicación
          </Button>
          <Button onClick={() => onViewOriginal(adjudicacion)} variant="secondary" className="bg-blue-600 hover:bg-blue-700 text-white">
            <ExternalLink className="w-4 h-4 mr-2" />
            Ver Original
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default AdjudicacionCard;