// Roles del sistema unificado. Oficina: Estado, Pagos, Cobros, Stock. Ventas (SVC): en /ventas/app/.
export const ROLE_LABELS = {
  admin: 'Administrador',
  usuario: 'Oficina',
  supervisor: 'Supervisor (ventas)',
  vendedor: 'Vendedor',
  logistica: 'Logística',
  chofer: 'Chofer',
};
export const esOficina = (role) => role === 'admin' || role === 'usuario';
export const URL_VENTAS = '/ventas/app/';
