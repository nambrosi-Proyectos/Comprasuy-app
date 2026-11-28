# Sistema unificado · gestion.comprasuy.com

Un solo sistema, una sola base MySQL y un solo usuario por persona:

| Ruta | Qué es | Quién entra |
|---|---|---|
| `/` y `/app/...` | Gestión: Llamados, Pliegos, Presupuestos, Pagos, Cobros, Stock | Administrador y Oficina |
| `/ventas/` | Página pública de SVC | Cualquiera |
| `/ventas/app/` | SVC: ventas, terreno, recorridos, comisiones, logística, entregas | Administrador, Supervisor, Vendedor, Logística, Chofer |

## Roles

| Rol | Gestión (Estado, Pagos, Cobros, Stock) | Ventas (SVC) |
|---|---|---|
| Administrador | ✓ | ✓ (único que ve la lista REMAR) |
| Oficina (`usuario`) | ✓ | — |
| Supervisor, Vendedor, Logística, Chofer | — | ✓ (según su rol en SVC) |

- Se entra por cualquiera de los dos login: la sesión es la misma. Un vendedor que entra por el login de gestión va directo a `/ventas/app/`.
- Los usuarios se crean en Configuración → Usuarios (gestión) o en SVC → Configuración → Usuarios. Es la misma tabla `users`.
- Un usuario desactivado no entra a ninguna de las dos partes.

## Fase 1: pasos en Hostinger

### 1. Repositorios privados (GitHub)
En cada repositorio: **Settings → General → Danger Zone → Change visibility → Make private**.
- `nicolasambrosi/svc-comprasuy` (hoy es público)
- `nambrosi-Proyectos/Comprasuy-app` y `nicolasambrosi/Comprasuy-app` (hoy son públicos; ahora tienen también el código de ventas)

`nambrosi-Proyectos/svc-comprasuy` ya es privado y Hostinger lo publica sin problema, así que los otros también van a funcionar privados.

### 2. Migrar los datos de SVC (una sola vez)
1. Elegir un momento sin ventas en curso: lo que se cargue en svc.comprasuy.com **después** de la migración no se copia.
2. En la Web App de este sistema (hoy estado.comprasuy.com) → **Variables de entorno**, agregar las de la base vieja de SVC
   (los mismos valores que tiene la Web App svc.comprasuy.com en DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD):

   | Variable | Valor |
   |---|---|
   | `SVC_DB_HOST` | el DB_HOST de SVC |
   | `SVC_DB_PORT` | `3306` |
   | `SVC_DB_NAME` | la base de SVC (ej. `u943125021_svc`) |
   | `SVC_DB_USER` | el usuario de esa base |
   | `SVC_DB_PASSWORD` | su contraseña |

3. Reiniciar o volver a publicar la app. Al arrancar copia todo y lo deja anotado en el registro:
   `Migración de SVC terminada: {...}`. Si se vuelve a arrancar, no copia de nuevo.
4. Revisar en `/ventas/app/` que estén las ventas, clientes, productos y usuarios.
5. Borrar las variables `SVC_DB_*`.

Qué hace la migración:
- Usuarios de SVC → tabla `users`, **con la misma contraseña**. Las sesiones viejas no pasan: todos vuelven a entrar una vez.
- Si un email ya existía en gestión, se usa ese usuario (con **su contraseña de gestión**) y sus ventas, clientes y zonas pasan a él.
  Rol: administrador si lo era en alguno de los dos; si en gestión era Oficina, sigue Oficina; si no, el rol de SVC.
- Productos, clientes, ventas, zonas, recorridos, visitas, fotos, audios, comisiones, camiones y entregas → tabla `svc_docs`.

### 3. Dominio gestion.comprasuy.com
1. hPanel → la Web App de este sistema → **Dominio**: conectar `gestion.comprasuy.com` (subdominio de comprasuy.com, no hay que comprar nada).
2. Cuando abra bien, agregar la variable `PUBLIC_HOST` = `gestion.comprasuy.com`: cualquier otro dominio que llegue a esta app
   (por ejemplo estado.comprasuy.com) redirige solo a gestion.comprasuy.com con la misma ruta.
3. svc.comprasuy.com: una vez revisada la migración, redirigirlo a `https://gestion.comprasuy.com/ventas/` (hPanel → Redirecciones)
   y detener la Web App vieja de SVC. No borrar su base hasta estar seguros.
4. No tocar app.comprasuy.com ni web.comprasuy.com.

## Lo que sigue (fases 2 a 4)
- Fase 2: productos y clientes únicos (SVC deja de usar svc_docs para productos, clientes y ventas).
- Fase 3: stock único (cada venta y entrega de SVC descuenta del módulo Stock).
- Fase 4: lo que falta cobrar de las ventas de SVC pasa a Cobros.
