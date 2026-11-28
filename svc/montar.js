// Monta SVC (ventas, terreno, logística) dentro del servidor principal, en /ventas.
//   /ventas/          página pública de SVC
//   /ventas/app/      el sistema de ventas
//   /ventas/api/...   su API (misma sesión y misma base que el resto)
const path = require('path');
const express = require('express');

module.exports = async function montarSvc(app) {
  const { migrarDesdeSvc } = require('./server/migrar');
  const auth = require('./server/auth');

  // Primero la migración (si corresponde), así el catálogo inicial no se carga encima de los datos reales.
  try {
    await migrarDesdeSvc();
  } catch (e) {
    console.error('No se pudo migrar SVC (se sigue sin migrar):', e.message);
  }
  // Después, los productos de SVC se unen con el catálogo de Stock (una vez, con los datos reales).
  try {
    await require('./server/unificarProductos').unificarProductos();
  } catch (e) {
    console.error('No se pudieron unir los productos de SVC con Stock:', e.message);
  }
  await require('./server/scope').migrateSupervisors();
  // El catálogo de ejemplo de SVC ya no se carga: los productos son los del módulo Stock y los de SVC migrados.
  setInterval(() => auth.cleanSessions().catch(() => {}), 6 * 3600e3).unref();

  app.use('/ventas/api', require('./server/api')());
  app.use('/ventas', express.static(path.join(__dirname, 'app'), {
    setHeaders: (res, file) => res.set('Cache-Control', /\.(svg|png|jpg|woff2?)$/.test(file) ? 'public, max-age=86400' : 'no-cache'),
  }));
  app.use('/ventas', (_req, res) => res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>No encontrado</title><p style="font-family:sans-serif">Página no encontrada. <a href="/ventas/">Volver a SVC</a></p>'));
};
