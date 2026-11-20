import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

export type Executor = Pool | PoolConnection;
export type Row = Record<string, any>;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) {
      throw new Error("Faltan las variables DB_HOST, DB_USER, DB_PASSWORD y DB_NAME para conectar con MySQL.");
    }
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT) || 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      charset: "utf8mb4",
      timezone: "Z", // las fechas se guardan en UTC
      dateStrings: ["DATE"], // DATE vuelve como "YYYY-MM-DD"
      connectionLimit: 5,
      waitForConnections: true,
    });
  }
  return pool;
}

/** Ejecuta `fn` dentro de una transacción. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

const TABLE_OPTIONS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

/**
 * Crea las tablas si no existen. Es seguro ejecutarlo en cada arranque.
 * Equivale al esquema que tenía el proyecto en Supabase.
 */
const SCHEMA = [
  // ---------- Usuarios y sesiones ----------
  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(191) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'usuario',
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,
  // Estado de las funciones largas (IA). Va en la base y no en memoria porque Hostinger
  // corre varios procesos de la app y la consulta puede llegar a otro proceso.
  `CREATE TABLE IF NOT EXISTS function_jobs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    status VARCHAR(10) NOT NULL,
    data LONGTEXT NULL,
    error TEXT NULL,
    code INT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_function_jobs_created (created_at),
    CONSTRAINT fk_function_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // ---------- Llamados guardados (oportunidades de cada usuario) ----------
  `CREATE TABLE IF NOT EXISTS llamados (
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NULL,
    titulo TEXT NULL,
    link TEXT NULL,
    organismo VARCHAR(500) NULL,
    estado VARCHAR(100) NULL,
    fecha_cierre_texto VARCHAR(255) NULL,
    descripcion_completa MEDIUMTEXT NULL,
    fecha_publicacion DATETIME NULL,
    fecha_modificacion DATETIME NULL,
    items LONGTEXT NULL,
    presentado TINYINT(1) NOT NULL DEFAULT 0,
    adjudicado TINYINT(1) NOT NULL DEFAULT 0,
    adjudicado_items LONGTEXT NULL,
    adjudicado_monto DOUBLE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_llamados_user (user_id, created_at)
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS presupuestos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    llamado_id VARCHAR(255) NOT NULL,
    items LONGTEXT NULL,
    total_presupuesto DOUBLE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_presupuestos_llamado (llamado_id),
    CONSTRAINT presupuestos_llamado_id_fkey FOREIGN KEY (llamado_id) REFERENCES llamados(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS lista_precios (
    id CHAR(36) NOT NULL PRIMARY KEY,
    item_nombre TEXT NULL,
    cantidad DOUBLE NULL,
    precio_unitario DOUBLE NULL,
    llamado_id VARCHAR(255) NULL,
    llamado_titulo TEXT NULL,
    presupuesto_id CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lista_created (created_at),
    INDEX idx_lista_presupuesto (presupuesto_id),
    CONSTRAINT fk_lista_llamado FOREIGN KEY (llamado_id) REFERENCES llamados(id) ON DELETE CASCADE,
    CONSTRAINT fk_lista_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // ---------- Clientes, productos y precios ----------
  `CREATE TABLE IF NOT EXISTS clientes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cuit VARCHAR(50) NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS productos_base (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nombre TEXT NOT NULL,
    codigo VARCHAR(100) NULL UNIQUE,
    precio_unitario DOUBLE NULL,
    moneda VARCHAR(10) NULL DEFAULT 'UYU',
    iva DOUBLE NULL DEFAULT 22,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS precios_cliente (
    id CHAR(36) NOT NULL PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    producto_id CHAR(36) NOT NULL,
    precio_unitario DOUBLE NULL,
    iva DOUBLE NULL DEFAULT 22,
    moneda VARCHAR(10) NULL DEFAULT 'UYU',
    fecha_ultima_venta DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_precio_cliente_producto (cliente_id, producto_id),
    CONSTRAINT fk_precios_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    CONSTRAINT fk_precios_producto FOREIGN KEY (producto_id) REFERENCES productos_base(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS temp_precios_import (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    import_user_id CHAR(36) NULL,
    cliente_cuit VARCHAR(50) NULL,
    producto_codigo VARCHAR(100) NULL,
    precio_unitario DOUBLE NULL,
    fecha_ultima_venta DATE NULL,
    iva DOUBLE NULL,
    moneda VARCHAR(10) NULL,
    INDEX idx_temp_user (import_user_id)
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS presupuestos_clientes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    cliente_id CHAR(36) NOT NULL,
    items LONGTEXT NULL,
    subtotal DOUBLE NULL,
    iva DOUBLE NULL,
    total DOUBLE NULL,
    moneda VARCHAR(10) NULL DEFAULT 'UYU',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pc_cliente (cliente_id, created_at),
    CONSTRAINT fk_pc_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  // ---------- Pagos: proveedores, depósitos (transferencias) y cheques emitidos ----------
  `CREATE TABLE IF NOT EXISTS proveedores (
    id CHAR(36) NOT NULL PRIMARY KEY,
    clave VARCHAR(191) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    rut VARCHAR(50) NULL,
    whatsapp VARCHAR(50) NULL,
    banco VARCHAR(100) NULL,
    tipo_cuenta VARCHAR(100) NULL,
    numero_cuenta VARCHAR(191) NULL,
    moneda VARCHAR(10) NULL DEFAULT 'UYU',
    notas TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS depositos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    fecha DATE NULL,
    proveedor_id CHAR(36) NULL,
    proveedor VARCHAR(255) NOT NULL,
    banco VARCHAR(100) NULL,
    tipo_cuenta VARCHAR(100) NULL,
    numero_cuenta VARCHAR(191) NULL,
    moneda VARCHAR(10) NOT NULL DEFAULT 'UYU',
    monto DOUBLE NOT NULL DEFAULT 0,
    concepto VARCHAR(500) NULL,
    pagado TINYINT(1) NOT NULL DEFAULT 0,
    fecha_pagado DATE NULL,
    import_key VARCHAR(64) NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_depositos_fecha (fecha),
    INDEX idx_depositos_pagado (pagado, fecha),
    CONSTRAINT fk_depositos_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS cheques (
    id CHAR(36) NOT NULL PRIMARY KEY,
    proveedor_id CHAR(36) NULL,
    proveedor VARCHAR(255) NOT NULL,
    fecha_entrega DATE NULL,
    fecha_pago DATE NULL,
    banco VARCHAR(100) NULL,
    numero VARCHAR(50) NULL,
    moneda VARCHAR(10) NOT NULL DEFAULT 'UYU',
    monto DOUBLE NOT NULL DEFAULT 0,
    concepto VARCHAR(500) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    import_key VARCHAR(64) NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cheques_pago (estado, fecha_pago),
    CONSTRAINT fk_cheques_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
  ) ${TABLE_OPTIONS}`,

  // ---------- Configuración ----------
  `CREATE TABLE IF NOT EXISTS pliego_config (
    id CHAR(36) NOT NULL PRIMARY KEY,
    razon_social VARCHAR(255) NULL,
    rut VARCHAR(50) NULL,
    direccion VARCHAR(255) NULL,
    email VARCHAR(191) NULL,
    telefono VARCHAR(100) NULL,
    footer_texto TEXT NULL,
    firma_imagen MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS palabras_clave_llamados (
    id CHAR(36) NOT NULL PRIMARY KEY,
    palabra VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS organismos_filter (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS ai_prompts (
    id CHAR(36) NOT NULL PRIMARY KEY,
    slug VARCHAR(100) NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    prompt_text MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,
];

/** Columnas agregadas después de la primera versión: se suman a las bases ya creadas. */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  // Imagen de la firma (data URL) que va al pie del pliego.
  { table: "pliego_config", column: "firma_imagen", definition: "MEDIUMTEXT NULL" },
  // A quién se le manda por WhatsApp el aviso de un depósito a pagar.
  { table: "pliego_config", column: "whatsapp_pagos", definition: "VARCHAR(50) NULL" },
];

export async function initSchema(): Promise<void> {
  const db = getPool();
  for (const statement of SCHEMA) await db.query(statement);
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const [rows] = await db.query<any[]>(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [table, column],
    );
    if (rows.length) continue;
    try {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Columna agregada: ${table}.${column}`);
    } catch (error) {
      // Otro proceso pudo agregarla al mismo tiempo (Hostinger arranca varios).
      if ((error as { code?: string })?.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }
}
