import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, DollarSign, Award, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/lib/utils';

const StatCard = ({ icon, title, value, color, loading }) => {
  const Icon = icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`p-6 rounded-2xl shadow-lg flex items-center gap-6 bg-gradient-to-br ${color}`}
    >
      <div className="p-4 bg-white/20 rounded-xl">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div>
        <p className="text-white/80 text-sm">{title}</p>
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-white mt-1" />
        ) : (
          <p className="text-3xl font-bold text-white">{value}</p>
        )}
      </div>
    </motion.div>
  );
};

const Stats = () => {
  const [stats, setStats] = useState({
    itemsPresupuestados: 0,
    valorTotalPresupuestado: 0,
    totalAdjudicado: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { data: presupuestosData, error: presupuestosError } = await supabase
          .from('presupuestos')
          .select('items, total_presupuesto');

        if (presupuestosError) throw presupuestosError;

        const itemsPresupuestados = presupuestosData.reduce((acc, p) => acc + (p.items?.length || 0), 0);
        const valorTotalPresupuestado = presupuestosData.reduce((acc, p) => acc + (p.total_presupuesto || 0), 0);
        
        const { data: adjudicadosData, error: adjudicadosError } = await supabase
          .from('llamados')
          .select('adjudicado_monto')
          .eq('adjudicado', true);

        if (adjudicadosError) throw adjudicadosError;

        const totalAdjudicado = adjudicadosData.reduce((acc, p) => acc + (p.adjudicado_monto || 0), 0);

        setStats({
          itemsPresupuestados,
          valorTotalPresupuestado,
          totalAdjudicado,
        });

      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    const channel = supabase
      .channel('stats-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamados' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presupuestos' }, fetchStats)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <StatCard 
        icon={Package} 
        title="Ítems Presupuestados" 
        value={stats.itemsPresupuestados}
        color="from-blue-500 to-blue-600"
        loading={loading}
      />
      <StatCard 
        icon={DollarSign} 
        title="Valor Total Presupuestado" 
        value={formatCurrency(stats.valorTotalPresupuestado)}
        color="from-violet-500 to-violet-600"
        loading={loading}
      />
      <StatCard 
        icon={Award} 
        title="Total Adjudicado" 
        value={formatCurrency(stats.totalAdjudicado)}
        color="from-orange-500 to-orange-600"
        loading={loading}
      />
    </div>
  );
};

export default Stats;