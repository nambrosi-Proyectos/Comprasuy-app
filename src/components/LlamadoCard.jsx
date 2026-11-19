import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Building, FileText, ExternalLink, Sparkles, Database, Clock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

const LlamadoCard = ({ llamado, index, onViewOriginal, onAnalyzeWithAI, onSaveToDb, isSaved, customButtons }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay: index * 0.1 }}
    className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl transition-all duration-300 hover:border-slate-300"
  >
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-2">
          <h3 className="text-xl font-bold text-slate-800 mb-2 flex-1 pr-4">{llamado.titulo}</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-slate-600">
          <div className="flex items-center"><Building className="w-4 h-4 mr-2 text-blue-500" /><span className="text-sm">{llamado.organismo}</span></div>
          <div className="flex items-center"><Calendar className="w-4 h-4 mr-2 text-purple-500" /><span className="text-sm">Apertura: {llamado.fecha_cierre_texto}</span></div>
          <div className="flex items-center"><FileText className="w-4 h-4 mr-2 text-orange-500" /><span className="text-sm">Publicado: {formatDate(llamado.fecha_publicacion)}</span></div>
          <div className="flex items-center"><Clock className="w-4 h-4 mr-2 text-gray-500" /><span className="text-sm">Modificado: {formatDate(llamado.fecha_modificacion)}</span></div>
        </div>
        
        <p className="text-slate-500 text-sm mb-4 line-clamp-2" dangerouslySetInnerHTML={{ __html: llamado.descripcion_completa }}/>
        
      </div>
      
      <div className="flex flex-wrap gap-3 lg:ml-6 lg:flex-col lg:items-end">
        {customButtons ? (
          customButtons
        ) : (
          <>
            <Button onClick={() => onAnalyzeWithAI(llamado)} variant="outline" className="border-violet-500 text-violet-600 hover:bg-violet-50 hover:text-violet-700">
              <Sparkles className="w-4 h-4 mr-2" />
              Analizar con IA
            </Button>
            {isSaved ? (
              <Button variant="outline" disabled className="border-green-500 text-green-600 bg-green-50">
                <Check className="w-4 h-4 mr-2" />
                Guardado
              </Button>
            ) : (
              <Button onClick={() => onSaveToDb(llamado)} variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700">
                <Database className="w-4 h-4 mr-2" />
                Guardar
              </Button>
            )}
          </>
        )}
        <Button onClick={() => onViewOriginal(llamado)} variant="secondary">
          <ExternalLink className="w-4 h-4 mr-2" />
          Ver Original
        </Button>
      </div>
    </div>
  </motion.div>
);

export default LlamadoCard;