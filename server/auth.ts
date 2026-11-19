import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const SESSION_COOKIE = "comprasuy_session";
const SESSION_DAYS = 14;

export const ROLES = ["admin", "usuario"] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at?: string;
}

export interface AuthedRequest extends Request<Record<string, string>> {
  user?: User;
}

// ---------- Contraseñas ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

export const normalizeEmail = (email: unknown) => (typeof email === "string" ? email.trim().toLowerCase() : "");
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const isValidEmail = (email: string) => EMAIL_RE.test(email);

const PUBLIC_FIELDS = "id, email, name, role, created_at";

// ---------- Usuarios ----------

export async function getUser(id: string): Promise<User | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`, [id]);
  return (rows[0] as User) ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${PUBLIC_FIELDS} FROM users WHERE email = ?`, [email]);
  return (rows[0] as User) ?? null;
}

export async function listUsers(): Promise<User[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT ${PUBLIC_FIELDS} FROM users ORDER BY created_at, email`);
  return rows as User[];
}

export async function createUser(data: { email: string; name: string; role: Role; password: string }): Promise<User> {
  const id = randomUUID();
  await getPool().query("INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)", [
    id,
    data.email,
    data.name,
    data.role,
    await hashPassword(data.password),
  ]);
  return (await getUser(id))!;
}

export async function setPassword(userId: string, password: string): Promise<void> {
  await getPool().query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(password), userId]);
}

export async function countAdmins(): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  return Number(rows[0].n);
}

/** Devuelve el usuario si email y contraseña son correctos. */
export async function checkCredentials(email: string, password: string): Promise<User | null> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT id, password_hash FROM users WHERE email = ?", [email]);
  const account = rows[0] as { id: string; password_hash: string } | undefined;
  if (!account) {
    await hashPassword(password); // tiempo de respuesta similar exista o no la cuenta
    return null;
  }
  if (!(await verifyPassword(password, account.password_hash))) return null;
  return getUser(account.id);
}

// ---------- Sesiones ----------

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getPool().query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    expires,
  ]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires,
    path: "/",
  });
}

function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = readSessionToken(req);
  if (token) await getPool().query("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Carga el usuario de la sesión (si hay) en `req.user`. No rechaza la petición. */
export async function loadSession(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const token = readSessionToken(req);
    if (token) {
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()",
        [hashToken(token)],
      );
      if (rows.length) {
        const user = await getUser(rows[0].user_id);
        if (user) req.user = user;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Corta la petición si no hay sesión. */
export function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Iniciá sesión para continuar." });
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Iniciá sesión para continuar." });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Solo un administrador puede hacer esto." });
  next();
}

// ---------- Recuperación de contraseña ----------

export async function createPasswordReset(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
  await getPool().query("DELETE FROM password_resets WHERE user_id = ?", [userId]);
  await getPool().query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    expires,
  ]);
  return token;
}

/** Usa un token de recuperación: devuelve el id del usuario o null si no es válido. */
export async function consumePasswordReset(token: string): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()",
    [hashToken(token)],
  );
  if (!rows.length) return null;
  await getPool().query("DELETE FROM password_resets WHERE token_hash = ?", [hashToken(token)]);
  return rows[0].user_id;
}

/**
 * Crea el administrador inicial a partir de INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD
 * si todavía no existe ningún administrador.
 */
export async function ensureInitialAdmin(): Promise<void> {
  const email = normalizeEmail(process.env.INITIAL_ADMIN_EMAIL);
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (await countAdmins()) return;
  if (!email || !password) {
    console.warn("No hay administradores. Cargá INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD y reiniciá la app.");
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError || !isValidEmail(email)) {
    console.error(`No se creó el administrador inicial: ${passwordError || "email inválido"}`);
    return;
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    await getPool().query("UPDATE users SET role = 'admin' WHERE id = ?", [existing.id]);
    await setPassword(existing.id, password);
  } else {
    await createUser({ email, name: process.env.INITIAL_ADMIN_NAME || "Administrador", role: "admin", password });
  }
  console.log(`Administrador inicial creado: ${email}`);
}
