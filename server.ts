import express from "express";
import path from "node:path";
import { initSchema } from "./server/db";
import { ensureInitialAdmin } from "./server/auth";
import { authRouter, adminRouter } from "./server/routes";
import { restRouter } from "./server/rest";
import { functionsRouter } from "./server/functions";
import { seedPrompts } from "./server/prompts";
import { aiProvider } from "./server/ai";

// Carga variables desde .env (si existe) para desarrollo local.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables de entorno del sistema (hPanel de Hostinger).
}

async function startServer() {
  const app = express();
  // Hostinger asigna el puerto con la variable PORT.
  const PORT = Number(process.env.PORT) || 3000;

  app.set("trust proxy", 1); // Hostinger atiende detrás de un proxy HTTPS
  app.disable("x-powered-by");
  app.use(express.json({ limit: "25mb" }));

  // Base de datos MySQL: crea las tablas, los prompts y el administrador inicial si hace falta.
  await initSchema();
  await seedPrompts();
  await ensureInitialAdmin();

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter());
  app.use("/api/admin", adminRouter());
  app.use("/api/db", restRouter());
  app.use("/api/functions", functionsRouter());
  app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Ruta de API inexistente." } }));

  if (process.env.NODE_ENV !== "production") {
    // En desarrollo, Vite sirve el frontend con recarga en caliente.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use("/assets", express.static(path.join(distPath, "assets"), { maxAge: "7d", immutable: true }));
    app.use(express.static(distPath, { index: false }));
    app.get("*all", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Comprasuy en http://localhost:${PORT} (IA: ${aiProvider()})`);
  });
}

startServer().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
