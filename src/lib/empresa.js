// Datos de la empresa que se usan si todavía no se cargaron en Configuración → Datos de la empresa.
export const EMPRESA_POR_DEFECTO = {
  razon_social: 'Comprasuy SAS',
  rut: '215276350015',
  email: 'Compras@comprasuy.com',
};

/** Completa los datos cargados con los valores por defecto (los campos vacíos no pisan). */
export const datosEmpresa = (config) => {
  const out = { ...EMPRESA_POR_DEFECTO };
  for (const [k, v] of Object.entries(config || {})) if (v != null && String(v).trim() !== '') out[k] = v;
  return out;
};

export const CONDICIONES_PLIEGO = [
  'Los precios cotizados son por todo concepto definido en el pliego.',
  'La presente oferta tiene el plazo de entrega definido en el pliego.',
  'El pago se realizará por SIIF según el pliego de condiciones.',
].join('\n');
