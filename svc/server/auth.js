// Usuarios, contraseñas y sesiones.
const crypto = require('crypto');
const { promisify } = require('util');
const store = require('./store');

const scrypt = promisify(crypto.scrypt);
// Misma sesión que el resto del sistema (tabla sessions, cookie comprasuy_session).
const COOKIE = 'comprasuy_session';
const SESSION_DAYS = 14;
// logistica: camiones y rutas de entrega · chofer: sus rutas de reparto (no ven ventas, clientes ni comisiones)
// usuario: personal de oficina (Estado, Pagos, Cobros, Stock); no entra a ventas.
const ROLES = ['admin', 'supervisor', 'vendedor', 'logistica', 'chofer', 'usuario'];

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}
async function verifyPassword(pw, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (pw.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}
const normEmail = e => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const publicUser = u => u && ({
  id: u.id, name: u.name, email: u.email, role: u.role, active: u.active !== false, createdAt: u.createdAt,
  zoneId: u.zoneId || '', supervisorId: u.supervisorId || '', commissionPct: u.commissionPct || 0, teamCommissionPct: u.teamCommissionPct || 0
});

async function findByEmail(email) {
  const users = await store.all('users');
  return users.find(u => normEmail(u.email) === email) || null;
}

// ----- sesiones -----
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
function readToken(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}
async function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await store.pool().query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash(token), user.id, expires]);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, expires, path: '/' });
}
async function destroySession(req, res) {
  const t = readToken(req);
  if (t) await store.pool().query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(t)]);
  res.clearCookie(COOKIE, { path: '/' });
}
async function loadUser(req, _res, next) {
  try {
    const t = readToken(req);
    if (t) {
      const [rows] = await store.pool().query('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [tokenHash(t)]);
      if (rows.length) {
        const u = await store.get('users', rows[0].user_id);
        if (u && u.active !== false) req.user = u;
      }
    }
    next();
  } catch (e) { next(e); }
}
async function cleanSessions() {
  await store.pool().query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
}

// Crea el administrador inicial (INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD) si no hay ninguno.
async function ensureInitialAdmin() { /* lo hace el sistema principal (server/auth.ts) */ }

// Freno simple contra intentos de clave repetidos (por IP + email).
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now(), a = attempts.get(key);
  if (!a || now - a.first > 15 * 60e3) return false;
  return a.count >= 8;
}
function noteFailure(key) {
  const now = Date.now(), a = attempts.get(key);
  if (!a || now - a.first > 15 * 60e3) attempts.set(key, { first: now, count: 1 });
  else a.count++;
}

module.exports = {
  ROLES, hashPassword, verifyPassword, passwordError, normEmail, validEmail, publicUser, findByEmail,
  createSession, destroySession, loadUser, cleanSessions, ensureInitialAdmin, tooManyAttempts, noteFailure,
  clearFailures: key => attempts.delete(key)
};
