import express from "express";
import {
  type AuthedRequest, type Role, ROLES, loadSession, requireUser, requireAdmin, checkCredentials, createSession,
  destroySession, setPassword, validatePassword, normalizeEmail, isValidEmail, findUserByEmail, getUser, listUsers,
  createUser, countAdmins, createPasswordReset, consumePasswordReset,
} from "./auth";
import { getPool } from "./db";
import { HttpError, wrap, rateLimit, apiErrorHandler } from "./http";
import { sendMail, mailConfigured } from "./mail";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function readRole(value: unknown): Role {
  if (typeof value !== "string" || !ROLES.includes(value as Role)) throw new HttpError(400, "Rol inválido.");
  return value as Role;
}

function readName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length > 191) throw new HttpError(400, "El nombre es demasiado largo.");
  return name;
}

export function authRouter() {
  const router = express.Router();
  router.use(loadSession);

  router.get("/me", wrap(async (req, res) => {
    res.json({ user: req.user ?? null, mailConfigured: mailConfigured() });
  }));

  router.post("/login", wrap(async (req, res) => {
    rateLimit(`login:${req.ip}`, 20, 15 * 60 * 1000);
    const user = await checkCredentials(normalizeEmail(req.body?.email), String(req.body?.password ?? ""));
    if (!user) throw new HttpError(401, "Correo o contraseña incorrectos.");
    await createSession(res, user.id);
    res.json({ user });
  }));

  router.post("/logout", wrap(async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
  }));

  // El usuario con sesión cambia su propia contraseña.
  router.post("/password", requireUser, wrap(async (req: AuthedRequest, res) => {
    const passwordError = validatePassword(req.body?.password);
    if (passwordError) throw new HttpError(400, passwordError);
    await setPassword(req.user!.id, req.body.password);
    res.json({ ok: true });
  }));

  // Recuperación: envía un enlace por correo (necesita SMTP configurado).
  router.post("/forgot", wrap(async (req, res) => {
    rateLimit(`forgot:${req.ip}`, 5, 15 * 60 * 1000);
    if (!mailConfigured()) {
      throw new HttpError(503, "El envío de correos no está configurado. Pedile a un administrador que restablezca tu contraseña.");
    }
    const email = normalizeEmail(req.body?.email);
    const user = isValidEmail(email) ? await findUserByEmail(email) : null;
    if (user) {
      const token = await createPasswordReset(user.id);
      const base = process.env.APP_URL?.replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
      const link = `${base}/reset-password?token=${token}`;
      await sendMail(
        user.email,
        "Recuperar contraseña - Comprasuy",
        `<p>Hola ${escapeHtml(user.name || "")}:</p>
         <p>Para elegir una nueva contraseña entrá en este enlace (vence en 1 hora):</p>
         <p><a href="${link}">${link}</a></p>
         <p>Si no lo pediste, ignorá este correo.</p>`,
      );
    }
    // Misma respuesta exista o no la cuenta.
    res.json({ ok: true });
  }));

  router.post("/reset", wrap(async (req, res) => {
    rateLimit(`reset:${req.ip}`, 10, 15 * 60 * 1000);
    const passwordError = validatePassword(req.body?.password);
    if (passwordError) throw new HttpError(400, passwordError);
    const userId = await consumePasswordReset(String(req.body?.token ?? ""));
    if (!userId) throw new HttpError(400, "El enlace de recuperación no es válido o venció. Solicitá uno nuevo.");
    await setPassword(userId, req.body.password);
    await getPool().query("DELETE FROM sessions WHERE user_id = ?", [userId]);
    res.json({ ok: true });
  }));

  router.use(apiErrorHandler);
  return router;
}

/** Gestión de usuarios: solo administradores. */
export function adminRouter() {
  const router = express.Router();
  router.use(loadSession, requireAdmin);

  router.get("/users", wrap(async (_req, res) => {
    res.json({ users: await listUsers() });
  }));

  router.post("/users", wrap(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) throw new HttpError(400, "El correo no es válido.");
    const passwordError = validatePassword(req.body?.password);
    if (passwordError) throw new HttpError(400, passwordError);
    if (await findUserByEmail(email)) throw new HttpError(409, "Ya existe un usuario con ese correo.");
    const user = await createUser({ email, name: readName(req.body?.name), role: readRole(req.body?.role ?? "usuario"), password: req.body.password });
    res.status(201).json({ user });
  }));

  router.patch("/users/:id", wrap(async (req: AuthedRequest, res) => {
    const target = await getUser(req.params.id);
    if (!target) throw new HttpError(404, "Usuario no encontrado.");
    const changes: Record<string, unknown> = {};
    if (req.body?.name !== undefined) changes.name = readName(req.body.name);
    if (req.body?.email !== undefined) {
      const email = normalizeEmail(req.body.email);
      if (!isValidEmail(email)) throw new HttpError(400, "El correo no es válido.");
      const other = await findUserByEmail(email);
      if (other && other.id !== target.id) throw new HttpError(409, "Ese correo ya lo usa otro usuario.");
      changes.email = email;
    }
    if (req.body?.role !== undefined) {
      const role = readRole(req.body.role);
      if (target.role === "admin" && role !== "admin" && (await countAdmins()) <= 1) {
        throw new HttpError(400, "Tiene que quedar al menos un administrador.");
      }
      changes.role = role;
    }
    const columns = Object.keys(changes);
    if (columns.length) {
      await getPool().query(`UPDATE users SET ${columns.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ?`, [
        ...columns.map((c) => changes[c]),
        target.id,
      ]);
    }
    if (req.body?.password) {
      const passwordError = validatePassword(req.body.password);
      if (passwordError) throw new HttpError(400, passwordError);
      await setPassword(target.id, req.body.password);
    }
    res.json({ user: await getUser(target.id) });
  }));

  router.delete("/users/:id", wrap(async (req: AuthedRequest, res) => {
    const target = await getUser(req.params.id);
    if (!target) throw new HttpError(404, "Usuario no encontrado.");
    if (target.id === req.user!.id) throw new HttpError(400, "No podés borrar tu propio usuario.");
    if (target.role === "admin" && (await countAdmins()) <= 1) throw new HttpError(400, "Tiene que quedar al menos un administrador.");
    await getPool().query("DELETE FROM users WHERE id = ?", [target.id]);
    res.json({ ok: true });
  }));

  router.use(apiErrorHandler);
  return router;
}
