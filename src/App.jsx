import React from 'react';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import LoginView from '@/components/views/LoginView';
import DashboardView from '@/components/views/DashboardView';
import MainLayout from '@/components/MainLayout';
import LlamadosView from '@/components/views/LlamadosView';
import OportunidadesView from '@/components/views/OportunidadesView';
import PreciosLicitadosView from '@/components/views/PreciosLicitadosView';
import ListaPreciosView from '@/components/views/ListaPreciosView';
import PresupuestosClientesView from '@/components/views/PresupuestosClientesView';
import AdjudicacionesView from '@/components/views/AdjudicacionesView';
import ConfiguracionView from '@/components/views/ConfiguracionView';
import PagosView from '@/components/views/PagosView';
import CobrosView from '@/components/views/CobrosView';
import { Loader2 } from 'lucide-react';

const AppContent = () => {
  const { user, loading, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink p-4">
        <Loader2 className="w-12 h-12 animate-spin text-brand" />
      </div>
    );
  }

  if (!user || passwordRecovery || window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery')) {
    return <LoginView />;
  }

  return (
    <>
      <Helmet>
        <title>Comprasuy · Compras Estatales</title>
        <meta name="description" content="Monitorea llamados y adjudicaciones del Estado uruguayo en tiempo real. Encuentra oportunidades de negocio y mantente actualizado con las compras públicas." />
        <meta property="og:title" content="Sistema de Gestión - Compras Estatales" />
        <meta property="og:description" content="Monitorea llamados y adjudicaciones del Estado uruguayo en tiempo real." />
      </Helmet>
      
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<DashboardView />} />
          <Route path="/app" element={<LlamadosView />} />
          <Route path="/app/llamados" element={<LlamadosView />} />
          <Route path="/app/oportunidades" element={<OportunidadesView />} />
          <Route path="/app/precios_licitados" element={<PreciosLicitadosView />} />
          <Route path="/app/lista_precios" element={<ListaPreciosView />} />
          <Route path="/app/presupuestos" element={<PresupuestosClientesView />} />
          <Route path="/app/adjudicaciones" element={<AdjudicacionesView />} />
          <Route path="/app/pagos" element={<PagosView />} />
          <Route path="/app/cobros" element={<CobrosView />} />
          <Route path="/app/configuracion" element={<ConfiguracionView />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
};

function App() {
  return (
    <Router>
        <AppContent />
    </Router>
  );
}

export default App;