import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: AuthedRequest, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Límite simple de intentos por IP (login, recuperación de contraseña).
const attempts = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) throw new HttpError(429, "Demasiados intentos. Esperá unos minutos y volvé a probar.");
}

/** Manejador de errores de la API: responde { error: { message, code } }. */
export function apiErrorHandler(error: unknown, _req: AuthedRequest, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { message: error.message, code: error.code } });
  }
  const sqlError = error as { code?: string; sqlMessage?: string };
  if (sqlError?.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: { message: "Ya existe un registro con esos datos.", code: "23505" } });
  }
  if (sqlError?.code === "ER_NO_REFERENCED_ROW_2" || sqlError?.code === "ER_NO_REFERENCED_ROW") {
    return res.status(409).json({ error: { message: "El registro relacionado no existe.", code: "23503" } });
  }
  console.error("Error en la API:", error);
  res.status(500).json({ error: { message: "Error interno del servidor." } });
}
