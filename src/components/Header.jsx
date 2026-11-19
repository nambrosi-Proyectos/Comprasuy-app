import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, UserCircle, LayoutDashboard, Building } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const Header = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const showDashboardButton = location.pathname !== '/';
  
  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.6 }} 
      className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b border-slate-200"
    >
      <div className="flex items-center mb-4 md:mb-0">
        <div className="h-12 w-12 md:h-16 md:w-16 mr-4 bg-slate-200 rounded-md flex items-center justify-center">
            <Building className="h-6 w-6 text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-slate-800">
            Sistema de Gestión
          </h1>
          <p className="text-sm md:text-md text-slate-600">Gestion integral de la Empresa</p>
        </div>
      </div>
      
      {user && (
        <div className="flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-4 w-full md:w-auto">
          <div className="flex items-center space-x-2">
            {showDashboardButton && (
              <Button asChild variant="outline" size="sm" className="border-slate-300 hover:bg-slate-100">
                <Link to="/">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </Link>
              </Button>
            )}
            <div className="flex items-center text-sm text-slate-600 bg-slate-100 px-3 py-2 rounded-md">
              <UserCircle className="w-5 h-5 mr-2 text-orange-500" />
              <span>{user.name || user.email}</span>
              {user.role === 'admin' && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-700">Admin</span>}
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="border-slate-300 hover:bg-slate-100">
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      )}
    </motion.header>
  );
};

export default Header;