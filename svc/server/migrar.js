// Migración única de SVC (svc.comprasuy.com) al sistema unificado.
// Si están las variables SVC_DB_HOST, SVC_DB_NAME, SVC_DB_USER y SVC_DB_PASSWORD (la base vieja de SVC),
// al arrancar copia todos sus datos a esta base, una sola vez:
//  - Usuarios → tabla users (con la misma contraseña). Si el email ya existe, se usa ese usuario y sus
//    ventas, clientes y zonas pasan a apuntar a él. Su rol: si en alguno de los dos sistemas es administrador,
//    queda administrador; si en este sistema es "usuario" (oficina), queda así; si no, el rol de SVC.
//  - Todo lo demás (productos, clientes, ventas, zonas, recorridos, visitas, imágenes, entregas…) → svc_docs.
// Las sesiones viejas no se copian: hay que volver a entrar.
const mysql = require('mysql2/promise');
const store = require('./store');

const MARCA = { collection: 'meta', id: 'migracion-svc' };

async function yaMigrado(pool) {
  const [rows] = await pool.query('SELECT data FROM svc_docs WHERE collection = ? AND id = ?', [MARCA.collection, MARCA.id]);
  return rows.length ? JSON.parse(rows[0].data) : null;
}

async function migrarDesdeSvc() {
  const { SVC_DB_HOST, SVC_DB_PORT, SVC_DB_USER, SVC_DB_PASSWORD, SVC_DB_NAME } = process.env;
  if (!SVC_DB_HOST || !SVC_DB_USER || !SVC_DB_NAME) return null;
  const pool = store.pool();
  const hecho = await yaMigrado(pool);
  if (hecho) {
    console.log(`SVC ya fue migrado el ${hecho.fecha}. Podés borrar las variables SVC_DB_*.`);
    return hecho;
  }

  const vieja = await mysql.createConnection({
    host: SVC_DB_HOST, port: Number(SVC_DB_PORT) || 3306, user: SVC_DB_USER, password: SVC_DB_PASSWORD, database: SVC_DB_NAME, charset: 'utf8mb4'
  });
  try {
    const [docs] = await vieja.query('SELECT collection, id, data FROM svc_docs');
    const usuariosSvc = docs.filter(d => d.collection === 'users').map(d => JSON.parse(d.data));
    const resto = docs.filter(d => d.collection !== 'users' && d.collection !== 'sessions');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Lo que haya quedado de pruebas (por ejemplo, el catálogo inicial) se reemplaza por los datos reales.
      await conn.query("DELETE FROM svc_docs WHERE collection <> 'meta'");

      // 1) Usuarios
      const [existentes] = await conn.query('SELECT id, email, role FROM users');
      const porEmail = new Map(existentes.map(u => [String(u.email).toLowerCase(), u]));
      const cambioId = new Map(); // id viejo de SVC → id en este sistema
      const resumenUsuarios = [];
      for (const u of usuariosSvc) {
        const email = String(u.email || '').trim().toLowerCase();
        if (!email) continue;
        const extra = {};
        for (const k of Object.keys(u)) if (!['id', 'email', 'name', 'role', 'passwordHash', 'active', 'createdAt'].includes(k)) extra[k] = u[k];
        const ya = porEmail.get(email);
        if (ya) {
          cambioId.set(u.id, ya.id);
          const rol = ya.role === 'admin' || u.role === 'admin' ? 'admin' : ya.role === 'usuario' ? 'usuario' : u.role;
          // Si ya existía, conserva su estado (activo o no) y su contraseña de este sistema.
          await conn.query('UPDATE users SET role = ?, svc = ? WHERE id = ?', [rol, JSON.stringify(extra), ya.id]);
          resumenUsuarios.push(`${email}: ya existía (rol ${rol})`);
        } else {
          await conn.query('INSERT INTO users (id, email, name, role, password_hash, active, svc) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [u.id, email, u.name || email, u.role || 'vendedor', u.passwordHash || '', u.active === false ? 0 : 1, JSON.stringify(extra)]);
          resumenUsuarios.push(`${email}: nuevo (${u.role})`);
        }
      }
      // Los usuarios que ya existían: el supervisor de cada uno también puede haber cambiado de id.
      const reemplazar = (texto) => {
        let t = texto;
        for (const [viejo, nuevo] of cambioId) if (viejo !== nuevo) t = t.split(JSON.stringify(viejo)).join(JSON.stringify(nuevo));
        return t;
      };
      if (cambioId.size) {
        const [conSvc] = await conn.query('SELECT id, svc FROM users WHERE svc IS NOT NULL');
        for (const r of conSvc) {
          const nuevo = reemplazar(r.svc);
          if (nuevo !== r.svc) await conn.query('UPDATE users SET svc = ? WHERE id = ?', [nuevo, r.id]);
        }
      }

      // 2) El resto de los datos
      const cuenta = {};
      for (const d of resto) {
        await conn.query('INSERT INTO svc_docs (collection, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
          [d.collection, d.id, reemplazar(d.data)]);
        cuenta[d.collection] = (cuenta[d.collection] || 0) + 1;
      }

      const marca = { id: MARCA.id, fecha: new Date().toISOString(), usuarios: resumenUsuarios, colecciones: cuenta };
      await conn.query('INSERT INTO svc_docs (collection, id, data) VALUES (?, ?, ?)', [MARCA.collection, MARCA.id, JSON.stringify(marca)]);
      await conn.commit();
      console.log('Migración de SVC terminada:', JSON.stringify({ usuarios: resumenUsuarios.length, colecciones: cuenta }));
      return marca;
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  } finally {
    await vieja.end().catch(() => {});
  }
}

module.exports = { migrarDesdeSvc, yaMigrado: () => yaMigrado(store.pool()) };
