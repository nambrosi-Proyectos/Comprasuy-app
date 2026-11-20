import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, FileText, Star, List, FileSignature, Award, Settings, History, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Mismo esquema que SVC (svc.comprasuy.com): menú lateral oscuro con el logo,
// ítem activo en naranja y el usuario abajo. En pantallas angostas pasa a barra superior.
const NAV = [
  { label: 'Panel', icon: LayoutDashboard, path: '/', end: true },
  { label: 'Llamados', icon: FileText, path: '/app/llamados' },
  { label: 'Oportunidades', icon: Star, path: '/app/oportunidades' },
  { label: 'Precios Licitados', icon: History, path: '/app/precios_licitados' },
  { label: 'Adjudicaciones', icon: Award, path: '/app/adjudicaciones' },
  { label: 'Presupuestos', icon: FileSignature, path: '/app/presupuestos' },
  { label: 'Presupuestos Entregados', icon: List, path: '/app/lista_precios' },
  { label: 'Configuración', icon: Settings, path: '/app/configuracion' },
];

const navClass = ({ isActive }) =>
  `flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 font-semibold leading-tight whitespace-nowrap min-[861px]:whitespace-normal transition-colors max-[860px]:py-2 max-[860px]:px-2.5 max-[860px]:text-sm ${
    isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;

const MainLayout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  // "/app" a secas muestra Llamados: que el menú lo marque como activo.
  const isAppRoot = location.pathname === '/app' || location.pathname === '/app/';
  // Estas pantallas no traen título propio: se lo pone el layout, como en SVC.
  const TITLES = { '/app/llamados': 'Llamados', '/app/oportunidades': 'Oportunidades', '/app/adjudicaciones': 'Adjudicaciones' };
  const pageTitle = isAppRoot ? 'Llamados' : TITLES[location.pathname.replace(/\/$/, '')];

  return (
    <div className="min-h-screen bg-slate-100 text-ink grid grid-cols-[232px_1fr] max-[860px]:grid-cols-1">
      <aside className="bg-ink text-white sticky top-0 h-screen h-[100dvh] overflow-y-auto flex flex-col gap-1 px-3.5 py-[18px] max-[860px]:z-30 max-[860px]:h-auto max-[860px]:flex-row max-[860px]:items-center max-[860px]:overflow-x-auto max-[860px]:p-2">
        <NavLink to="/" className="flex flex-col items-start gap-1 px-2 pt-1 pb-[18px] shrink-0 max-[860px]:p-0 max-[860px]:pr-2">
          {/* 1000×250 px: ancho y alto fijos en esa proporción para que nunca se deforme. */}
          <img
            src="/logo-comprasuy.webp"
            alt="Comprasuy"
            width={1000}
            height={250}
            className="block h-9 w-36 max-w-none object-contain object-left max-[860px]:h-6 max-[860px]:w-24"
          />
          <small className="text-[11.5px] font-semibold text-slate-400 max-[860px]:hidden">Compras Estatales</small>
        </NavLink>

        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={(state) => navClass({ isActive: state.isActive || (isAppRoot && item.path === '/app/llamados') })}
          >
            <item.icon className="w-[18px] h-[18px] shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="flex-1 max-[860px]:hidden" />
        <p className="text-xs text-slate-400 px-3 py-2 max-[860px]:hidden">Datos de comprasestatales.gub.uy</p>

        {user && (
          <div className="border-t border-slate-800 px-3 pt-3 pb-1 text-[13px] text-slate-300 shrink-0 max-[860px]:border-0 max-[860px]:p-0 max-[860px]:pl-1">
            <b className="block text-white text-sm truncate max-[860px]:hidden">{user.name || user.email}</b>
            <span className="inline-block mt-1 mb-2 rounded-full bg-slate-800 px-2 py-0.5 text-[11.5px] font-bold text-brand max-[860px]:hidden">
              {user.role === 'admin' ? 'Administrador' : 'Usuario'}
            </span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 font-semibold text-slate-300 hover:border-brand hover:text-white whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" /> Salir
            </button>
          </div>
        )}
      </aside>

      <main className="min-w-0 px-[30px] pt-[26px] pb-[60px] max-[860px]:px-3.5 max-[860px]:pt-[18px] max-[860px]:pb-[50px]">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {pageTitle && <h1 className="m-0 mb-5 text-[26px] font-extrabold text-ink">{pageTitle}</h1>}
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
};

export default MainLayout;
