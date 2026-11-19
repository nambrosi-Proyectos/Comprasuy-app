# Comprasuy – Sistema de Gestión de Compras Estatales

Réplica del sistema exportado de Hostinger Horizons, pero **sin Supabase**: ahora tiene su
propio servidor (Node.js + Express) y su propia base de datos **MySQL**, igual que SIAS.
Se publica en Hostinger como **Web App de Node.js**.

## Qué cambió respecto del original

| Antes (Horizons + Supabase) | Ahora |
|---|---|
| Usuarios y login de Supabase | Usuarios en la tabla `users` (contraseñas con scrypt) y sesión por cookie |
| Tablas en Postgres de Supabase | Las mismas tablas en MySQL; se crean solas al arrancar |
| Edge Functions (RSS, IA) | Rutas del servidor en `/api/functions/...` |
| Clave de Gemini escrita en el código del navegador | Las claves de IA solo están en el servidor (variables de entorno) |
| Sin administración de usuarios | **Administrador**: crea usuarios, cambia roles y contraseñas (Configuración → Usuarios) |

También se agregó en Configuración: **Datos de la empresa** (encabezado/pie de los
presupuestos) y **Mi cuenta** (cambiar la propia contraseña). Los prompts de IA ahora se
guardan en la base y lo que se edita en Configuración → Prompts de IA se usa de verdad.

Las pantallas (Llamados, Oportunidades, Precios licitados, Lista de precios, Presupuestos,
Adjudicaciones, Configuración) son las mismas del original.

## Estructura

```
server.ts            arranque: crea tablas, prompts y administrador; sirve la API y el sitio
server/db.ts         conexión MySQL y esquema de tablas
server/auth.ts       usuarios, contraseñas, sesiones, administrador inicial
server/routes.ts     /api/auth (login, recuperar contraseña) y /api/admin (usuarios)
server/rest.ts       /api/db: consultas a las tablas (reemplaza a Supabase) y RPC
server/functions.ts  /api/functions: RSS de comprasestatales.gub.uy y análisis con IA
server/ai.ts         Gemini / OpenAI / Claude
server/prompts.ts    prompts de IA por defecto
src/                 frontend React (el mismo del original)
src/lib/customSupabaseClient.js  cliente que habla con la API propia (misma forma que supabase-js)
```

## Desarrollo local

1. Copiá `.env.example` como `.env` y completá `DB_*` con una base MySQL y el administrador inicial.
2. `npm install`
3. `npm run dev` → http://localhost:3000

## Publicar en Hostinger (Web App de Node.js)

1. **Base de datos**: hPanel → *Bases de datos* → *Administración de MySQL* → crear base y
   usuario. Anotá nombre de la base, usuario y contraseña (el host suele ser `localhost`).
2. **Subir el código**: lo más cómodo es un repositorio de GitHub (como SIAS).
   `git init`, commit y push a un repo nuevo. También se puede subir un .zip del proyecto
   **sin** `node_modules`, `dist` ni `.env`.
3. hPanel → *Sitios web* → *Agregar sitio web* → **Web App de Node.js** → conectar el repo
   (o subir el zip).
   - Versión de Node: **20 o 22**
   - Comando de instalación: `npm install` (compila solo, por el `postinstall`)
   - Comando de compilación: `npm run build` (si lo pide; si no, dejarlo vacío)
   - Comando de inicio: `npm start`
   - Directorio de salida: no aplica (el servidor sirve `dist/`)
4. **Variables de entorno** (en la misma pantalla): las de `.env.example`:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (mínimo 8 caracteres), `INITIAL_ADMIN_NAME`
   - `GEMINI_API_KEY` (o `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`)
   - Opcional: `SMTP_*` y `APP_URL` para "¿Olvidaste tu contraseña?"
5. Desplegar. En el primer arranque se crean las tablas y el **usuario administrador**.
   Entrá con ese correo y contraseña; desde *Configuración → Usuarios* creás al resto.
   Después podés borrar `INITIAL_ADMIN_PASSWORD` de las variables.

Para comprobar que el servidor está vivo: `https://tu-dominio/api/health` → `{"ok":true}`.

## Pasar los datos de Supabase (opcional)

Si querés traer lo que ya estaba cargado: en Supabase → *Table Editor* exportá cada tabla
como CSV (`clientes`, `productos_base`, `precios_cliente`, `presupuestos_clientes`,
`llamados`, `presupuestos`, `lista_precios`, `palabras_clave_llamados`, `organismos_filter`,
`pliego_config`) e importalas en phpMyAdmin (hPanel) en ese orden, con la app ya desplegada
para que las tablas existan. En `llamados`, la columna `user_id` debe ser el `id` del usuario
nuevo en la tabla `users` (cada usuario ve solo sus oportunidades).

## Seguridad

- La clave de Gemini que estaba escrita en `src/lib/gemini.js` del export original quedó
  expuesta en el navegador: conviene **revocarla** en Google AI Studio y crear una nueva
  solo para la variable `GEMINI_API_KEY`.
- Todas las rutas de datos exigen sesión. Solo los administradores gestionan usuarios.
