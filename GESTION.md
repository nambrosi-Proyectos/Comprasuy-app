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

## Fases 2 y 3: productos y stock únicos

- **Un solo catálogo:** los productos son los del módulo Stock (`stock_productos`). Lo que vende SVC son sus **precios por lista**
  (`precios_lista`: comercio, instituciones y REMAR), con código, precio con IVA, IVA e imagen. Un producto puede estar en varias listas.
- **Un solo stock:** SVC muestra el stock del módulo Stock en el depósito propio (salas, góndolas y "Sin ubicar"; no cuenta lo que está en
  proveedores). Es el mismo número en todas las listas.
  - Cada venta de SVC genera una **salida** en Stock ("Venta SVC N° …"), de los lugares donde hay más mercadería.
  - Anular la venta la **devuelve** a los mismos lugares.
  - El ajuste de stock y la carga de productos con stock desde SVC quedan como ajustes en Stock.
- **REMAR:** sus precios solo los ven y cargan los administradores (también por la API del sistema de gestión).
- **En Stock**, cada producto muestra **Precios de venta (SVC)**: se puede agregar a una lista, cambiar el precio o sacarlo.
  Un producto que no está en ninguna lista no aparece en SVC.
- **Revisar repetidos** (Stock → Stock actual) lista productos con nombres parecidos (por ejemplo, uno de la planilla y otro de SVC):
  se elige cuál queda y el otro se une con su stock, histórico y precios. "No son iguales" lo saca de la lista.

### Unión automática (una sola vez, después de migrar SVC)
Al arrancar, si SVC ya fue migrado y tiene productos sin unir:
- Cada producto de SVC se busca en Stock por nombre, también escrito distinto ("Arroz Chef de 5 Kg" = "ARROZ CHEF 5 KILOS").
  Si existe, se une y **vale el stock de Stock** (los conteos). Si no existe, se crea con el stock que tenía SVC en "Sin ubicar".
- Los productos originales de SVC quedan guardados (`svc_docs`, colección `products_v1`) por si hay que revisar algo.
- El detalle (qué se unió y qué se creó) se ve en `/ventas/api/unificacion` (administrador).
- Conviene, antes de migrar SVC, tener importada la planilla de stock en Stock, así los productos se unen con los de la planilla.

## Lo que sigue
- Fase 4: lo que falta cobrar de las ventas de SVC pasa a Cobros.
