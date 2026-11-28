import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Star, Award, FileSignature, List, Settings, Users, Package, CheckCircle, Wallet, Calculator, Coins, Warehouse, Truck, AlertTriangle } from 'lucide-react';
import AlertasPagos from '@/components/pagos/AlertasPagos';
import ResumenDepositosDialog from '@/components/pagos/ResumenDepositosDialog';
import PorCobrar from '@/components/cobros/PorCobrar';
import { facturasPendientes, resumenPendientes, ventasSvcPendientes } from '@/lib/cobros';
import { traerVentasSvc } from '@/components/cobros/useCobros';
import { resumenStock, totalesStock } from '@/lib/stock';
import { formatoMonto } from '@/lib/pagos';

const StatCard = ({ icon: Icon, title, value, accent, loading }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className={`rounded-xl border p-[18px] flex items-start justify-between ${accent ? 'bg-ink border-ink text-white' : 'bg-white border-slate-200'}`}
  >
    <div>
      <span className={`text-[13px] font-semibold ${accent ? 'text-slate-400' : 'text-slate-500'}`}>{title}</span>
      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-brand mt-2" />
      ) : (
        <b className={`block text-[25px] mt-1 ${accent ? 'text-brand' : 'text-ink'}`}>{value}</b>
      )}
    </div>
    <Icon className={`w-6 h-6 ${accent ? 'text-brand' : 'text-slate-400'}`} />
  </motion.div>
);

const NavButton = ({ to, icon: Icon, label, desc }) => (
  <Link
    to={to}
    className="group bg-white border border-slate-200 rounded-xl p-[18px] flex items-center gap-4 hover:border-brand transition-colors"
  >
    <span className="w-11 h-11 rounded-[10px] bg-brand-light text-brand flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors">
      <Icon className="w-5 h-5" />
    </span>
    <span>
      <b className="block text-ink">{label}</b>
      <span className="text-[13px] text-slate-500">{desc}</span>
    </span>
  </Link>
);
const DashboardView = () => {
  const [stats, setStats] = useState({
    presentaciones: 0,
    productos: 0,
    clientes: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [pagos, setPagos] = useState(null);
  const [resumen, setResumen] = useState(false);
  const [porCobrar, setPorCobrar] = useState(null);
  const [stock, setStock] = useState(null);

  useEffect(() => {
    // Alertas de pagos: solo cheques pendientes y depósitos sin pagar (pocas filas).
    Promise.all([
      supabase.from('cheques').select('id, proveedor, fecha_pago, monto, moneda, estado').eq('estado', 'pendiente'),
      supabase.from('depositos').select('id, proveedor, fecha, monto, moneda, pagado').eq('pagado', false),
    ]).then(([c, d]) => {
      if (!c.error && !d.error) setPagos({ cheques: c.data || [], depositos: d.data || [] });
    });
    // Lo que falta cobrar: facturas del Estado sin cobrar y saldos de cuentas corrientes.
    Promise.all([
      supabase.from('cobro_clientes').select('id, modalidad'),
      supabase.from('facturas').select('id, emisor, cliente_id, cliente, fecha, moneda, importe, cobrada, created_at'),
      supabase.from('cobros').select('id, cliente_id, fecha, moneda, importe, created_at'),
      traerVentasSvc().catch(() => []),
    ]).then(([cl, f, co, svc]) => {
      if (cl.error || f.error || co.error) return;
      const pendientes = [...facturasPendientes(cl.data || [], f.data || [], co.data || []), ...ventasSvcPendientes(svc)];
      if (!pendientes.length && !(f.data || []).length) return;
      setPorCobrar({ pendientes, resumen: resumenPendientes(pendientes) });
    });
    // Stock: valor adentro y afuera, y productos bajo el mínimo.
    Promise.all([
      supabase.from('stock_productos').select('id, costo, stock_minimo, activo'),
      supabase.from('stock_ubicaciones').select('id, tipo'),
      supabase.from('stock_movimientos').select('producto_id, ubicacion_id, tipo, cantidad, fecha, created_at'),
    ]).then(([p, u, m]) => {
      if (p.error || u.error || m.error || !(p.data || []).length) return;
      setStock(totalesStock(resumenStock(p.data, u.data || [], m.data || [])));
    });
  }, []);

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

  return (
    <div>
      <div className="flex justify-between items-center gap-3.5 flex-wrap mb-5">
        <h1 className="m-0 text-[26px] font-extrabold">Panel</h1>
        <Button asChild>
          <Link to="/app/llamados"><FileText className="w-4 h-4" /> Ver llamados</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={CheckCircle} title="Presentaciones" value={stats.presentaciones} accent loading={loadingStats} />
        <StatCard icon={Package} title="Productos" value={stats.productos} loading={loadingStats} />
        <StatCard icon={Users} title="Clientes" value={stats.clientes} loading={loadingStats} />
      </div>

      {pagos && (
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-ink">Pagos</h2>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setResumen(true)}><Calculator className="mr-2 h-4 w-4" /> Resumen de depósitos del día</Button>
              <Link to="/app/pagos" className="text-sm font-semibold text-brand hover:underline">Ver pagos</Link>
            </div>
          </div>
          {(pagos.cheques.length > 0 || pagos.depositos.length > 0) && <AlertasPagos cheques={pagos.cheques} depositos={pagos.depositos} />}
        </div>
      )}
      <ResumenDepositosDialog open={resumen} onClose={() => setResumen(false)} />

      {porCobrar && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-ink">Cobros</h2>
            <Link to="/app/cobros" className="text-sm font-semibold text-brand hover:underline">Ver cobros</Link>
          </div>
          <PorCobrar resumen={porCobrar.resumen} pendientes={porCobrar.pendientes} />
        </div>
      )}

      {stock && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-ink">Stock</h2>
            <Link to="/app/stock" className="text-sm font-semibold text-brand hover:underline">Ver stock</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/app/stock" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand">
              <span className="text-[13px] font-semibold flex items-center gap-1.5"><Warehouse className="h-4 w-4" /> Valor en el depósito</span>
              <b className="block text-xl mt-1 tabular-nums">{formatoMonto(stock.valorDentro)}</b>
              <p className="text-xs mt-1 text-slate-500">{stock.conStock} productos con stock</p>
            </Link>
            <Link to="/app/stock" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand">
              <span className="text-[13px] font-semibold flex items-center gap-1.5"><Truck className="h-4 w-4" /> Valor afuera</span>
              <b className="block text-xl mt-1 tabular-nums">{formatoMonto(stock.valorAfuera)}</b>
              <p className="text-xs mt-1 text-slate-500">En depósitos de proveedores</p>
            </Link>
            <Link to="/app/stock" className={`rounded-xl border p-4 hover:border-brand ${stock.bajoMinimo ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900'}`}>
              <span className="text-[13px] font-semibold flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Bajo el mínimo</span>
              <b className="block text-xl mt-1 tabular-nums">{stock.bajoMinimo}</b>
              <p className="text-xs mt-1 opacity-75">Productos para reponer</p>
            </Link>
          </div>
        </div>
      )}

      <h2 className="text-base font-bold text-ink mb-3">Accesos rápidos</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <NavButton to="/app/llamados" icon={FileText} label="Llamados" desc="Lo último publicado en Compras Estatales" />
        <NavButton to="/app/oportunidades" icon={Star} label="Oportunidades" desc="Llamados guardados para cotizar" />
        <NavButton to="/app/adjudicaciones" icon={Award} label="Adjudicaciones" desc="Resultados y precios adjudicados" />
        <NavButton to="/app/presupuestos" icon={FileSignature} label="Presupuestos" desc="Presupuestos a clientes" />
        <NavButton to="/app/lista_precios" icon={List} label="Presupuestos Entregados" desc="Presupuestos generados para clientes" />
        <NavButton to="/app/pagos" icon={Wallet} label="Pagos" desc="Depósitos y cheques a proveedores" />
        <NavButton to="/app/cobros" icon={Coins} label="Cobros" desc="Facturas al Estado y cuentas corrientes" />
        <NavButton to="/app/stock" icon={Warehouse} label="Stock" desc="Depósito por sala y góndola, y stock en proveedores" />
        <NavButton to="/app/configuracion" icon={Settings} label="Configuración" desc="Empresa, usuarios, filtros y prompts" />
      </div>
    </div>
  );
};
export default DashboardView;