// Une los productos de SVC con el catálogo del módulo Stock (una vez, después de migrar SVC).
// Para cada producto de SVC (uno por lista: comercio, institución, REMAR):
//  - Busca el producto físico del mismo nombre en Stock (también nombres casi iguales).
//    Si existe, se une: el stock que vale es el de Stock (los conteos por góndola).
//  - Si no existe, lo crea en Stock con el stock que tenía SVC (en "Sin ubicar").
//  - Su precio, código, IVA e imagen quedan en precios_lista con el mismo id (las ventas viejas siguen andando).
// Los productos originales quedan guardados en svc_docs como "products_v1" por si hay que revisar algo.
const store = require('./store');
const productos = require('./productos');

async function unificarProductos() {
  const pool = store.pool();
  const [migrado] = await pool.query("SELECT 1 FROM svc_docs WHERE collection = 'meta' AND id = 'migracion-svc'");
  if (!migrado.length && process.env.SVC_SIN_MIGRAR !== '1') return null; // todavía no se trajeron los datos reales de SVC
  const [docs] = await pool.query("SELECT id, data FROM svc_docs WHERE collection = 'products'");
  if (!docs.length) return null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const unidos = [], nuevos = [];
    const stockNuevo = new Map(); // producto físico creado → stock sumado de sus listas
    for (const fila of docs) {
      const doc = JSON.parse(fila.data);
      const existente = await productos.buscarProducto(conn, doc.name, true);
      const guardado = await productos.put(conn, Object.assign({}, doc, { stock: undefined }), { parecido: true, sinStock: true });
      const [[pl]] = await conn.query('SELECT producto_id FROM precios_lista WHERE id = ?', [guardado.id]);
      if (existente) {
        unidos.push(`${doc.name} (${doc.list || 'comercio'}) → ${existente.nombre}`);
      } else {
        stockNuevo.set(pl.producto_id, (stockNuevo.get(pl.producto_id) || 0) + Math.max(0, Number(doc.stock) || 0));
        nuevos.push(`${doc.name} (${doc.list || 'comercio'})`);
      }
    }
    // Stock que tenía SVC de los productos nuevos: queda contado en "Sin ubicar" para ubicarlo después.
    const sin = await productos.sinUbicar(conn);
    const filas = [...stockNuevo].filter(([, cant]) => cant > 0).map(([producto_id, cantidad]) => ({
      producto_id, ubicacion_id: sin, tipo: 'conteo', cantidad, nota: 'Stock que tenía SVC',
    }));
    await productos.insertarMovs(conn, filas);

    await conn.query(`INSERT INTO svc_docs (collection, id, data) SELECT 'products_v1', id, data FROM svc_docs WHERE collection = 'products'
      ON DUPLICATE KEY UPDATE data = VALUES(data)`);
    await conn.query("DELETE FROM svc_docs WHERE collection = 'products'");
    const [[previo]] = await conn.query("SELECT COUNT(*) AS n FROM svc_docs WHERE collection = 'meta' AND id = 'productos-unificados'");
    const marca = { id: 'productos-unificados', fecha: new Date().toISOString(), unidos, nuevos };
    if (previo.n) await conn.query("UPDATE svc_docs SET data = ? WHERE collection = 'meta' AND id = 'productos-unificados'", [JSON.stringify(marca)]);
    else await conn.query("INSERT INTO svc_docs (collection, id, data) VALUES ('meta', 'productos-unificados', ?)", [JSON.stringify(marca)]);
    await conn.commit();
    console.log(`Productos de SVC unidos con Stock: ${unidos.length} ya existían, ${nuevos.length} nuevos.`);
    return marca;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { unificarProductos };
