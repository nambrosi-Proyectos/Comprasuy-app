import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Star, List, FileSignature, Award, Settings, History } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const tabs = [
  { value: 'llamados', label: 'Llamados', icon: FileText, path: '/app/llamados' },
  { value: 'oportunidades', label: 'Oportunidades', icon: Star, path: '/app/oportunidades' },
  { value: 'precios_licitados', label: 'Precios Licitados', icon: History, path: '/app/precios_licitados' },
  { value: 'lista_precios', label: 'Lista de Precios', icon: List, path: '/app/lista_precios' },
  { value: 'presupuestos', label: 'Presupuestos', icon: FileSignature, path: '/app/presupuestos' },
  { value: 'adjudicaciones', label: 'Adjudicaciones', icon: Award, path: '/app/adjudicaciones' },
  { value: 'configuracion', label: 'Configuración', icon: Settings, path: '/app/configuracion' },
];

const MainLayout = () => {
  const location = useLocation();
  const currentTab = location.pathname.split('/')[2] || 'llamados';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="container mx-auto px-4 py-8">
        <Header />
        <main className="mt-8">
          <Tabs value={currentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 h-auto p-2 bg-slate-200/80 dark:bg-slate-800/80 rounded-lg">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} asChild>
                  <Link to={tab.path} className="flex-col sm:flex-row gap-2 h-auto py-2 px-3 data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                    <tab.icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </Link>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-6">
              <motion.div
                key={location.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Outlet />
              </motion.div>
            </div>
          </Tabs>
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default MainLayout;