import express from "express";
import path from "node:path";
import { createRequire } from "node:module";
import { initSchema } from "./server/db";
import { ensureInitialAdmin } from "./server/auth";
import { authRouter, adminRouter } from "./server/routes";
import { restRouter } from "./server/rest";
import { functionsRouter } from "./server/functions";
import { svcVentasRouter } from "./server/svcVentas";
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
  // Dominio principal (gestion.comprasuy.com): los otros dominios de la misma app redirigen a él.
  const PUBLIC_HOST = process.env.PUBLIC_HOST?.trim().toLowerCase();
  if (PUBLIC_HOST) {
    app.use((req, res, next) => {
      const host = (req.hostname || "").toLowerCase();
      if (!host || host === PUBLIC_HOST || host === "localhost" || host === "127.0.0.1" || req.path === "/api/health") return next();
      res.redirect(301, `https://${PUBLIC_HOST}${req.originalUrl}`);
    });
  }
  app.use(express.json({ limit: "25mb" }));

  // Base de datos MySQL: crea las tablas, los prompts y el administrador inicial si hace falta.
  await initSchema();
  await seedPrompts();
  await ensureInitialAdmin();

  // SVC (ventas, terreno y logística) en /ventas, con la misma base y la misma sesión.
  // Es código CommonJS: se carga en tiempo de ejecución desde la carpeta svc/ del proyecto.
  const montarSvc = createRequire(path.join(process.cwd(), "package.json"))("./svc/montar.js");
  await montarSvc(app);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter());
  app.use("/api/admin", adminRouter());
  app.use("/api/db", restRouter());
  app.use("/api/functions", functionsRouter());
  app.use("/api/svc-ventas", svcVentasRouter());
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
