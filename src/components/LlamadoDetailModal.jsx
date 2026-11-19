import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Sparkles, Package, Hash, Bot, AlertTriangle, Lightbulb, Briefcase, ChevronRight, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzeLlamadoWithAI } from '@/lib/gemini';
import { useToast } from '@/components/ui/use-toast';
import ItemsLlamadoTable from '@/components/ItemsLlamadoTable';

const backdrop = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};

const modal = {
  hidden: { y: "100vh", opacity: 0 },
  visible: {
    y: "0",
    opacity: 1,
    transition: { delay: 0.1, type: "spring", stiffness: 80, damping: 20 },
  },
};

const AiAnalysisView = ({ llamado, onItemsExtracted }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const handleStartAnalysis = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    toast({
      title: '🤖 Analizando con IA...',
      description: 'Obteniendo información clave del llamado. Por favor, espera.',
    });

    try {
      const result = await analyzeLlamadoWithAI(llamado);
      setAnalysis(result);
      if (onItemsExtracted) {
        onItemsExtracted(result.items_presupuesto ?? result.items_solicitados);
      }
      toast({
        title: '✅ ¡Análisis completado!',
        description: 'La IA ha procesado el llamado exitosamente.',
      });
    } catch (err) {
      setError('Hubo un error al comunicarse con la IA. Por favor, intenta de nuevo.');
      toast({
        variant: 'destructive',
        title: '❌ Error en el Análisis',
        description: 'No se pudo obtener la respuesta de la IA.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleStartAnalysis();
  }, [llamado]);


  return (
    <div className="bg-slate-50 p-6 rounded-xl border border-purple-500/50 mt-6 dark:bg-slate-900/50">
      <div className="flex items-center mb-4">
        <Sparkles className="w-6 h-6 mr-3 text-purple-600 dark:text-purple-400" />
        <h3 className="text-xl font-semibold text-slate-800 dark:text-white">Análisis con IA</h3>
      </div>
      
      {loading && (
        <div className="flex flex-col items-center justify-center p-8">
          <Bot className="w-12 h-12 text-purple-600 animate-bounce dark:text-purple-400" />
          <p className="mt-4 text-lg text-slate-600 dark:text-gray-300">Procesando con Gemini... un momento.</p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle className="w-12 h-12 text-red-400" />
          <p className="mt-4 text-lg text-red-300">Error en el Análisis</p>
          <p className="mt-2 text-sm text-red-400">{error}</p>
          <Button onClick={handleStartAnalysis} variant="destructive" className="mt-4">
            Reintentar Análisis
          </Button>
        </div>
      )}
      
      {analysis && (
        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="space-y-6">
            <div className="bg-white p-4 rounded-lg dark:bg-slate-800/50">
                <h4 className="font-semibold text-lg text-slate-800 flex items-center mb-2 dark:text-white"><Lightbulb className="w-5 h-5 mr-2 text-yellow-500 dark:text-yellow-400" /> Resumen Ejecutivo</h4>
                <p className="text-slate-700 dark:text-gray-300">{analysis.resumen_ejecutivo}</p>
            </div>
            
            {analysis.items?.length > 0 ? (
              <ItemsLlamadoTable items={analysis.items} />
            ) : (
            <div>
                <h4 className="font-semibold text-lg text-slate-800 flex items-center mb-3 dark:text-white"><Package className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" /> Ítems Solicitados</h4>
                <div className="space-y-3">
                    {(analysis.items_solicitados || []).map((item, index) => (
                        <div key={index} className="p-3 bg-white rounded-lg dark:bg-slate-800/50">
                            <div className="flex justify-between items-center font-semibold text-slate-700 dark:text-gray-200">
                               <span>{item.item}</span>
                               {item.cantidad && <span className="flex items-center text-sm"><Hash className="w-4 h-4 mr-1 text-green-600 dark:text-green-400"/> {item.cantidad}</span>}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">{item.descripcion}</p>
                        </div>
                    ))}
                </div>
            </div>
            )}

            <div>
                <h4 className="font-semibold text-lg text-slate-800 flex items-center mb-3 dark:text-white"><Briefcase className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" /> Requerimientos Clave</h4>
                 <ul className="space-y-2 list-inside">
                    {(analysis.requerimientos_clave || []).map((req, index) => (
                        <li key={index} className="flex items-start text-slate-700 dark:text-gray-300"><ChevronRight className="w-5 h-5 mr-1 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0"/>{req}</li>
                    ))}
                </ul>
            </div>
             <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                <h4 className="font-semibold text-lg text-slate-800 flex items-center mb-2 dark:text-white"><Sparkles className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" /> Potencial de Negocio</h4>
                <p className="text-green-700 dark:text-green-300">{analysis.potencial_interes}</p>
            </div>
        </motion.div>
      )}

    </div>
  );
};

const LlamadoDetailModal = ({ isOpen, onClose, llamado, onViewOriginal, onItemsExtracted }) => {
  if (!llamado) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-slate-100 border border-purple-500/50 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8 relative dark:bg-slate-800/80"
            variants={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white"
              onClick={onClose}
            >
              <X className="h-6 w-6" />
            </Button>

            <h2 className="text-2xl font-bold text-slate-800 mb-2 pr-10 dark:text-white">{llamado.titulo}</h2>
            <div className="flex items-center text-sm text-slate-500 mb-4 dark:text-gray-400">
                <Building className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" /> {llamado.organismo}
            </div>
            
            <AiAnalysisView llamado={llamado} onItemsExtracted={onItemsExtracted} />

            <div className="mt-8 flex justify-end">
              <Button onClick={() => onViewOriginal(llamado)} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                <ExternalLink className="w-4 h-4 mr-2" />
                Ir a la Fuente Original
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LlamadoDetailModal;