import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Star, Award, FileSignature, List, Settings, Users, Package, CheckCircle } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const StatCard = ({
  icon,
  title,
  value,
  color,
  loading
}) => {
  const Icon = icon;
  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    duration: 0.5
  }} className={`p-6 rounded-2xl shadow-lg flex items-center gap-6 bg-gradient-to-br ${color}`}>
      <div className="p-4 bg-white/20 rounded-xl">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div>
        <p className="text-white/80 text-sm">{title}</p>
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-white mt-1" /> : <p className="text-3xl font-bold text-white">{value}</p>}
      </div>
    </motion.div>;
};
const NavButton = ({
  to,
  icon,
  label,
  color
}) => {
  const Icon = icon;
  return <motion.div whileHover={{
    scale: 1.05
  }} whileTap={{
    scale: 0.95
  }}>
      <Button asChild size="lg" className={`w-full h-24 text-lg justify-start p-6 ${color}`}>
        <Link to={to}>
          <Icon className="w-8 h-8 mr-4" />
          {label}
        </Link>
      </Button>
    </motion.div>;
};
const DashboardView = () => {
  const [stats, setStats] = useState({
    presentaciones: 0,
    productos: 0,
    clientes: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const [presentacionesRes, productosRes, clientesRes] = await Promise.all([
          supabase.from('llamados').select('*', { count: 'exact', head: true }).eq('presentado', true), 
          supabase.from('productos_base').select('*', { count: 'exact', head: true }), 
          supabase.from('clientes').select('*', { count: 'exact', head: true })
        ]);
        
        if (presentacionesRes.error) console.error("Error fetching presentaciones stats:", presentacionesRes.error);
        if (productosRes.error) console.error("Error fetching productos stats:", productosRes.error);
        if (clientesRes.error) console.error("Error fetching clientes stats:", clientesRes.error);

        setStats({
          presentaciones: presentacionesRes.count || 0,
          productos: productosRes.count || 0,
          clientes: clientesRes.count || 0
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  return <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="container mx-auto px-4 py-8">
        <Header />
        <main className="mt-8">
          <motion.div initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} transition={{
          duration: 0.5
        }}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <h1 className="text-3xl font-bold text-slate-800">Incio</h1>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <StatCard icon={CheckCircle} title="Presentaciones" value={stats.presentaciones} color="from-green-500 to-green-600" loading={loadingStats} />
              <StatCard icon={Package} title="Productos" value={stats.productos} color="from-blue-500 to-blue-600" loading={loadingStats} />
              <StatCard icon={Users} title="Clientes" value={stats.clientes} color="from-violet-500 to-violet-600" loading={loadingStats} />
            </div>

            <h2 className="text-2xl font-bold text-slate-700 mb-6">Accesos Rápidos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <NavButton to="/app/llamados" icon={FileText} label="Llamados" color="bg-sky-500 hover:bg-sky-600" />
              <NavButton to="/app/oportunidades" icon={Star} label="Oportunidades" color="bg-amber-500 hover:bg-amber-600" />
              <NavButton to="/app/adjudicaciones" icon={Award} label="Adjudicaciones" color="bg-teal-500 hover:bg-teal-600" />
              <NavButton to="/app/presupuestos" icon={FileSignature} label="Presupuestos" color="bg-indigo-500 hover:bg-indigo-600" />
              <NavButton to="/app/lista_precios" icon={List} label="Lista de Precios" color="bg-rose-500 hover:bg-rose-600" />
              <NavButton to="/app/configuracion" icon={Settings} label="Configuración" color="bg-slate-500 hover:bg-slate-600" />
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    </div>;
};
export default DashboardView;