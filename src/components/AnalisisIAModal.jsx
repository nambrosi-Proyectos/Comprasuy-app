import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles, Clipboard, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const backdrop = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};

const modal = {
  hidden: { y: '100vh', opacity: 0 },
  visible: {
    y: '0',
    opacity: 1,
    transition: { delay: 0.1, type: 'spring', stiffness: 80, damping: 20 },
  },
};

const AnalisisIAModal = ({ isOpen, onClose, llamado }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [proposal, setProposal] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const performAnalysis = async () => {
      if (!isOpen || !llamado) return;

      setLoading(true);
      setAnalysis(null);
      setProposal('');

      try {
        const { data: presupuesto, error: presupuestoError } = await supabase
          .from('presupuestos')
          .select('*')
          .eq('llamado_id', llamado.id)
          .maybeSingle();

        if (presupuestoError) {
            console.warn("No se encontró presupuesto para este llamado, se continuará sin él.", presupuestoError.message);
        }

        const { data, error } = await supabase.functions.invoke('analyze-pliego', {
          body: { llamado, presupuesto },
        });

        if (error) {
          throw new Error(`Error en la función de IA: ${error.message}`);
        }
        
        if (data.error) {
            throw new Error(`Error del servidor de IA: ${data.error}`)
        }

        setAnalysis(data.analysis);
        setProposal(data.proposal);
        toast({
          title: '🤖 ¡Análisis completado!',
          description: 'La IA ha procesado el pliego y generado una propuesta.',
        });

      } catch (error) {
        console.error("Error al analizar con IA:", error);
        toast({
          variant: 'destructive',
          title: '❌ Error de análisis',
          description: error.message || 'No se pudo completar el análisis con IA.',
        });
      } finally {
        setLoading(false);
      }
    };

    performAnalysis();
  }, [isOpen, llamado, toast]);
  
  const handleCopyToClipboard = () => {
    if (!proposal) return;
    navigator.clipboard.writeText(proposal);
    setIsCopied(true);
    toast({ title: '📋 ¡Propuesta copiada!', description: 'El texto está listo para ser pegado.' });
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && llamado && (
        <motion.div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
          variants={backdrop} initial="hidden" animate="visible" exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-slate-100 border border-blue-500/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col dark:bg-slate-800/80"
            variants={modal} onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200 flex justify-between items-center flex-shrink-0 dark:border-slate-700">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center">
                  <Sparkles className="w-6 h-6 mr-3 text-blue-500" />
                  Análisis y Propuesta IA
                </h2>
                <p className="text-sm text-slate-500 mt-1 truncate max-w-md dark:text-gray-400">{llamado?.titulo || 'Cargando...'}</p>
              </div>
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-2 gap-6">
              {loading ? (
                <div className="md:col-span-2 flex flex-col justify-center items-center h-full text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                  <p className="mt-4 text-slate-600 dark:text-gray-300">La IA está analizando el pliego y preparando tu propuesta...</p>
                  <p className="text-sm text-slate-400 dark:text-gray-500">Esto puede tomar un momento.</p>
                </div>
              ) : (
                <>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700 space-y-4">
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-white">Análisis del Pliego</h3>
                    {analysis ? (
                      <div className="space-y-4 text-sm">
                        <div>
                          <h4 className="font-bold text-slate-600 dark:text-gray-300">Resumen Ejecutivo:</h4>
                          <p className="text-slate-500 dark:text-gray-400">{analysis.resumen_ejecutivo}</p>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-600 dark:text-gray-300">Ítems Clave Detectados:</h4>
                          <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-gray-400">
                            {analysis.items_clave?.map((item, i) => <li key={i}><strong>{item.item}:</strong> {item.descripcion}</li>) || <li>No se detectaron ítems específicos.</li>}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-600 dark:text-gray-300">Requerimientos Importantes:</h4>
                           <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-gray-400">
                            {analysis.requerimientos_importantes?.map((req, i) => <li key={i}>{req}</li>) || <li>No se detectaron requerimientos clave.</li>}
                          </ul>
                        </div>
                      </div>
                    ) : <p className="text-slate-500 dark:text-gray-400">No se pudo generar el análisis.</p>}
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700 flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-semibold text-slate-700 dark:text-white">Borrador de Propuesta</h3>
                      <Button onClick={handleCopyToClipboard} size="sm" variant="outline" disabled={!proposal}>
                          {isCopied ? <Check className="w-4 h-4 mr-2 text-green-500"/> : <Clipboard className="w-4 h-4 mr-2"/>}
                          {isCopied ? 'Copiado' : 'Copiar'}
                      </Button>
                    </div>
                    {proposal ? (
                      <div className="prose prose-sm max-w-none text-slate-600 dark:text-gray-300 whitespace-pre-wrap flex-grow overflow-y-auto p-2 bg-white dark:bg-slate-800 rounded-md">
                          {proposal}
                      </div>
                    ) : <p className="text-slate-500 dark:text-gray-400">No se pudo generar la propuesta.</p>}
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end items-center dark:border-slate-700 dark:bg-slate-900/50">
              <Button onClick={onClose}>Cerrar</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnalisisIAModal;