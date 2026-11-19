import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const backdrop = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};

const modal = {
  hidden: { scale: 0.9, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { delay: 0.1, type: 'spring', stiffness: 120, damping: 20 },
  },
};

export const IAAnalysisModal = ({ isOpen, onClose, analysisState }) => {
  if (!isOpen) return null;

  const renderContent = () => {
    if (analysisState.analyzing) {
      return (
        <>
          <Loader2 className="w-16 h-16 animate-spin text-purple-500" />
          <h3 className="text-xl font-semibold mt-6 text-slate-700 dark:text-white">Analizando archivo con IA</h3>
          <p className="text-slate-500 dark:text-gray-400 mt-2 text-center">
            La inteligencia artificial está interpretando la estructura de tu archivo.
            <br />
            Esto puede tomar unos segundos...
          </p>
        </>
      );
    }

    if (analysisState.result === 'success') {
      return (
        <>
          <CheckCircle className="w-16 h-16 text-green-500" />
          <h3 className="text-xl font-semibold mt-6 text-slate-700 dark:text-white">Análisis Exitoso</h3>
          <p className="text-slate-500 dark:text-gray-400 mt-2 text-center">
            Los datos han sido procesados y se están sincronizando con tu base de datos.
          </p>
          <Button onClick={onClose} className="mt-6">Entendido</Button>
        </>
      );
    }
    
    if (analysisState.result === 'error') {
        return (
          <>
            <AlertTriangle className="w-16 h-16 text-red-500" />
            <h3 className="text-xl font-semibold mt-6 text-slate-700 dark:text-white">Error en el Análisis</h3>
            <p className="text-slate-500 dark:text-gray-400 mt-2 text-center">
              No se pudo procesar el archivo. Por favor, revisa que el formato sea correcto e inténtalo de nuevo.
            </p>
            <Button onClick={onClose} variant="destructive" className="mt-6">Cerrar</Button>
          </>
        );
      }
    
    return null;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
        variants={backdrop} initial="hidden" animate="visible" exit="hidden"
      >
        <motion.div
          className="bg-white dark:bg-slate-800/80 border border-purple-500/30 shadow-2xl rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col items-center justify-center p-8 text-center"
          variants={modal}
        >
          <div className="absolute top-4 right-4">
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          </div>
          <Sparkles className="w-8 h-8 text-purple-400 absolute top-6 left-6 opacity-50"/>
          {renderContent()}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};