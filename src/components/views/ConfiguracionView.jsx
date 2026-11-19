import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import FiltrosManagement from '@/components/configuracion/FiltrosManagement';
import AiPromptsManagement from '@/components/configuracion/AiPromptsManagement';
import UsersManagement from '@/components/configuracion/UsersManagement';
import EmpresaManagement from '@/components/configuracion/EmpresaManagement';
import CuentaManagement from '@/components/configuracion/CuentaManagement';

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const ConfiguracionView = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [configData, setConfigData] = useState({
    palabrasClave: [],
    organismos: [],
    aiPrompts: [],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [palabrasRes, promptsRes, organismosRes] = await Promise.all([
        supabase.from('palabras_clave_llamados').select('*'),
        supabase.from('ai_prompts').select('*'),
        supabase.from('organismos_filter').select('*'),
      ]);

      if (palabrasRes.error) throw palabrasRes.error;
      if (promptsRes.error) throw promptsRes.error;
      if (organismosRes.error) throw organismosRes.error;

      setConfigData({
        palabrasClave: palabrasRes.data || [],
        aiPrompts: promptsRes.data || [],
        organismos: organismosRes.data || [],
      });

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos de configuración', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [fetchData, user]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-12 h-12 animate-spin text-orange-500" /></div>;
  }
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Configuración General</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
            <FiltrosManagement
              initialPalabras={configData.palabrasClave}
              initialOrganismos={configData.organismos}
              onDataChange={fetchData}
            />
        </motion.div>
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
            <AiPromptsManagement initialPrompts={configData.aiPrompts} onDataChange={fetchData} />
        </motion.div>
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
            <EmpresaManagement />
        </motion.div>
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
            <CuentaManagement />
        </motion.div>
      </div>
      {isAdmin && (
        <motion.div variants={sectionVariants} initial="hidden" animate="visible">
          <UsersManagement />
        </motion.div>
      )}
    </motion.div>
  );
};

export default ConfiguracionView;