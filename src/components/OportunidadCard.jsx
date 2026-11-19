import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Calculator,
  Trash2,
  CheckCircle2,
  Award,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: 'easeOut',
    },
  }),
};

const OportunidadCard = ({
  llamado,
  index,
  onOpenPliego,
  onOpenPresupuesto,
  onOpenAdjudicado,
  onOpenAnalisisIA,
  onDelete,
  onMarkAsPresented,
}) => {

  const handleViewOriginal = () => {
    if (llamado.link) {
     window.open(llamado.link, '_blank', 'noopener,noreferrer');
   }
 };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-shadow duration-300 overflow-hidden"
    >
      <div className="p-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div className="flex-grow">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{llamado.titulo}</h3>
              {llamado.presentado && <Badge variant="default" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700">Presentado</Badge>}
              {llamado.adjudicado && <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700">Adjudicado</Badge>}
            </div>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              <span className="font-semibold">{llamado.organismo}</span>
            </p>
             <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
              Guardado: {formatDate(llamado.created_at)}
            </p>
          </div>
          <div className="flex-shrink-0">
             <Button onClick={handleViewOriginal} variant="ghost" size="icon" className="text-slate-400 hover:text-orange-500">
                <ExternalLink className="w-5 h-5" />
            </Button>
            <Button onClick={onDelete} variant="ghost" size="icon" className="text-slate-400 hover:text-red-500">
                <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/30 px-6 py-4 flex flex-wrap items-center justify-start gap-3">
        <Button onClick={onOpenPliego} variant="outline" size="sm">
          <FileText className="w-4 h-4 mr-2" />
          Preparar Pliego
        </Button>
        <Button onClick={onOpenPresupuesto} variant="outline" size="sm">
          <Calculator className="w-4 h-4 mr-2" />
          Presupuestar
        </Button>
        <Button onClick={() => onMarkAsPresented(llamado)} variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700 dark:text-green-300 dark:border-green-600 dark:hover:bg-green-900/50" disabled={llamado.presentado}>
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {llamado.presentado ? 'Presentado' : 'Marcar Presentado'}
        </Button>
        <Button onClick={onOpenAdjudicado} variant="outline" size="sm" className="text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:border-blue-600 dark:hover:bg-blue-900/50" disabled={llamado.adjudicado}>
          <Award className="w-4 h-4 mr-2" />
          {llamado.adjudicado ? 'Adjudicado' : 'Marcar Adjudicado'}
        </Button>
        <Button onClick={onOpenAnalisisIA} variant="default" size="sm">
          <Sparkles className="w-4 h-4 mr-2" />
          Analizar con IA
        </Button>
      </div>
    </motion.div>
  );
};

export default OportunidadCard;