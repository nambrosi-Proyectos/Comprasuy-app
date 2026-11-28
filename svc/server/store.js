// Almacén de datos de SVC dentro del sistema unificado (gestion.comprasuy.com).
// - Usa la misma base MySQL que el resto del sistema (variables DB_*).
// - Los usuarios son los del sistema (tabla users): un solo usuario y una sola contraseña para todo.
// - Los productos son los del catálogo único (stock_productos + precios_lista) y su stock es el del módulo Stock.
// - El resto de SVC sigue guardándose como documentos JSON en la tabla svc_docs (fase 1 de la unificación).
const mysql = require('mysql2/promise');
const productos = require('./productos');

let pool = null;
function getPool() {
  if (!pool) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) throw new Error('Faltan las variables DB_HOST, DB_USER y DB_NAME.');
    pool = mysql.createPool({
      host: DB_HOST, port: Number(DB_PORT) || 3306, user: DB_USER, password: DB_PASSWORD, database: DB_NAME,
      charset: 'utf8mb4', timezone: 'Z', connectionLimit: 5, waitForConnections: true
    });
  }
  return pool;
}

// ---------- usuarios: tabla users ----------
// Campos propios de SVC (supervisor, zona, comisiones…) van en la columna JSON users.svc.
const BASE_USER = ['id', 'email', 'name', 'role', 'passwordHash', 'active', 'createdAt'];
function userFromRow(r) {
  let extra = {};
  try { extra = r.svc ? JSON.parse(r.svc) : {}; } catch { extra = {}; }
  return Object.assign(extra, {
    id: r.id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash,
    active: r.active === null || r.active === undefined ? true : !!r.active,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
  });
}
function userToRow(doc) {
  const extra = {};
  for (const k of Object.keys(doc)) if (!BASE_USER.includes(k)) extra[k] = doc[k];
  return [String(doc.id), String(doc.email || '').toLowerCase(), doc.name || '', doc.role || 'vendedor', doc.passwordHash || '', doc.active === false ? 0 : 1, JSON.stringify(extra)];
}
const USER_COLS = 'id, email, name, role, password_hash, active, svc, created_at';

const api = (exec, lock) => {
  const forUpdate = lock ? ' FOR UPDATE' : '';
  return {
    async all(col) {
      if (col === 'products') return productos.all(exec, lock);
      if (col === 'users') {
        const [rows] = await exec.query(`SELECT ${USER_COLS} FROM users ORDER BY created_at` + forUpdate);
        return rows.map(userFromRow);
      }
      const [rows] = await exec.query('SELECT data FROM svc_docs WHERE collection = ?' + forUpdate, [col]);
      return rows.map(r => JSON.parse(r.data));
    },
    async get(col, id) {
      if (col === 'products') return productos.get(exec, lock, id);
      if (col === 'users') {
        const [rows] = await exec.query(`SELECT ${USER_COLS} FROM users WHERE id = ?` + forUpdate, [String(id)]);
        return rows.length ? userFromRow(rows[0]) : null;
      }
      const [rows] = await exec.query('SELECT data FROM svc_docs WHERE collection = ? AND id = ?' + forUpdate, [col, String(id)]);
      return rows.length ? JSON.parse(rows[0].data) : null;
    },
    async put(col, doc) {
      if (col === 'products') return productos.put(exec, doc);
      if (col === 'users') {
        await exec.query(
          `INSERT INTO users (id, email, name, role, password_hash, active, svc) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), role = VALUES(role),
             password_hash = VALUES(password_hash), active = VALUES(active), svc = VALUES(svc)`,
          userToRow(doc));
        return doc;
      }
      await exec.query(
        'INSERT INTO svc_docs (collection, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
        [col, String(doc.id), JSON.stringify(doc)]);
      return doc;
    },
    async del(col, id) {
      if (col === 'products') return productos.del(exec, id);
      if (col === 'users') { await exec.query('DELETE FROM users WHERE id = ?', [String(id)]); return; }
      await exec.query('DELETE FROM svc_docs WHERE collection = ? AND id = ?', [col, String(id)]);
    },
    async clear(col) {
      if (col === 'products') return productos.clear(exec);
      if (col === 'users') throw new Error('No se pueden borrar todos los usuarios.');
      await exec.query('DELETE FROM svc_docs WHERE collection = ?', [col]);
    }
  };
};

const base = {
  kind: 'mysql',
  pool: () => getPool(),
  async init() {
    // La tabla svc_docs y las columnas de users las crea el servidor principal (server/db.ts).
  },
  // Ejecuta fn dentro de una transacción; las lecturas bloquean las filas hasta el final.
  async tx(fn) {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(api(conn, true));
      await conn.commit();
      return out;
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }
};
for (const k of ['all', 'get', 'put', 'del', 'clear']) base[k] = (...args) => api(getPool(), false)[k](...args);

module.exports = base;
