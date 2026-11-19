// Prompts de IA. Se guardan en la tabla ai_prompts para poder editarlos desde
// Configuración; las marcas {{variable}} se reemplazan al usarlos.
import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import { querySql } from "./rest";

interface PromptDef {
  slug: string;
  name: string;
  description: string;
  prompt_text: string;
}

export const DEFAULT_PROMPTS: PromptDef[] = [
  {
    slug: "analizar_llamado",
    name: "Análisis rápido de llamado",
    description: "Pestaña Llamados → Analizar con IA. Variables: {{titulo}}, {{descripcion}}.",
    prompt_text: `Analiza el siguiente texto de un llamado a licitación de compras estatales de Uruguay y extrae la información clave en formato JSON.
El texto a analizar es:
---
Título: {{titulo}}
Descripción: {{descripcion}}
---
El JSON de salida debe tener la siguiente estructura:
{
  "resumen_ejecutivo": "Un resumen de 2 o 3 líneas sobre el objetivo principal del llamado.",
  "items_solicitados": [
    {
      "item": "Nombre del producto o servicio",
      "descripcion": "Descripción detallada del ítem.",
      "cantidad": "La cantidad solicitada, si se especifica. Puede ser un número o texto como 'Según necesidad'."
    }
  ],
  "requerimientos_clave": [
    "Un requerimiento importante detectado",
    "Otro requerimiento crucial para los oferentes"
  ],
  "potencial_interes": "Describe en una frase por qué este llamado podría ser una buena oportunidad de negocio."
}
Si no puedes encontrar información para un campo, déjalo como un array vacío o un string vacío. Extrae al menos 2 items si es posible. Sé conciso y directo.`,
  },
  {
    slug: "extraer_items",
    name: "Extraer ítems del pliego",
    description: "Presupuestar → Extraer ítems con IA. Variable: {{pliego}}.",
    prompt_text: `Analiza la descripción de la siguiente licitación y extrae una lista de los ítems solicitados con sus cantidades.
La respuesta debe ser un objeto JSON con una única clave "items" que contenga un array de objetos. Cada objeto debe tener las claves "item" (string) y "cantidad" (number).
Si no puedes determinar una cantidad, usa 1. Si no encuentras ítems, devuelve un array vacío.

Descripción:
---
{{pliego}}
---

Ejemplo de respuesta:
{
  "items": [
    { "item": "Silla de oficina ergonómica", "cantidad": 50 },
    { "item": "Escritorio de 1.20m", "cantidad": 25 }
  ]
}`,
  },
  {
    slug: "analisis_pliego",
    name: "Análisis del pliego",
    description: "Oportunidades → Analizar con IA (resumen). Variable: {{pliego}}.",
    prompt_text: `Analiza el siguiente pliego de licitación de Uruguay y genera un resumen conciso en formato JSON.
Pliego:
---
{{pliego}}
---
Extrae la siguiente información:
{
  "resumen_ejecutivo": "Un resumen de 2-3 líneas sobre el objetivo principal del llamado.",
  "items_clave": [
    { "item": "Nombre del producto/servicio", "descripcion": "Descripción breve" }
  ],
  "requerimientos_importantes": [
    "Requerimiento clave para los oferentes (ej: garantía, plazos de entrega, certificaciones)."
  ]
}
Si no encuentras información, devuelve arrays o strings vacíos. Sé directo y preciso.`,
  },
  {
    slug: "propuesta_tecnica",
    name: "Borrador de propuesta técnica",
    description: "Oportunidades → Analizar con IA (propuesta). Variables: {{pliego}}, {{presupuesto}}.",
    prompt_text: `Basado en el siguiente pliego de licitación y nuestro presupuesto, redacta un borrador de propuesta técnica para presentar.
El tono debe ser profesional y formal. Estructura la propuesta con:
1.  **Introducción**: Presentación de nuestra empresa (ComprasUY SAS) y el propósito de la oferta.
2.  **Comprensión de la Necesidad**: Demostrar que entendemos lo que solicitan.
3.  **Solución Propuesta**: Detallar los ítems que ofrecemos, mencionando que cumplen con lo solicitado en el pliego.
4.  **Cierre**: Ponerse a las órdenes.

Pliego:
---
{{pliego}}
---
Nuestro Presupuesto:
---
{{presupuesto}}
---
Genera solo el texto de la propuesta, sin formato JSON.`,
  },
  {
    slug: "pedido_texto",
    name: "Pedido en texto → presupuesto",
    description: "Presupuestos → Analizar pedido con IA. Variables: {{pedido}}, {{catalogo}}.",
    prompt_text: `Analiza el siguiente texto de un pedido y compáralo con el catálogo de productos proporcionado.
Tu tarea es identificar los productos y las cantidades solicitadas en el texto y mapearlos a los productos del catálogo.

Texto del pedido:
---
{{pedido}}
---

Catálogo de productos disponibles:
---
{{catalogo}}
---

Instrucciones:
1. Para cada línea o ítem en el "Texto del pedido", encuentra el producto más relevante del "Catálogo de productos".
2. Extrae la cantidad solicitada para cada producto. Si no se especifica una cantidad, asume que es 1.
3. Devuelve un array de objetos JSON. Cada objeto debe tener las claves "producto_id" (el ID del producto del catálogo) y "cantidad" (un número).
4. Si no puedes hacer coincidir un ítem del pedido con un producto del catálogo, omítelo del resultado.
5. La respuesta DEBE ser únicamente el array JSON, sin texto adicional, explicaciones, ni estar envuelto en markdown.

Ejemplo de salida esperada:
[
  { "producto_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6", "cantidad": 10 },
  { "producto_id": "z9y8x7w6-v5u4-t3s2-r1q0-p9o8n7m6l5k4", "cantidad": 5 }
]`,
  },
  {
    slug: "importar_excel",
    name: "Importar Excel de precios con IA",
    description: "Presupuestos → Importar con IA. Variable: {{datos}}.",
    prompt_text: `Analiza el siguiente array de objetos JSON, que representa las filas de un archivo Excel de ventas o precios.
Tu tarea es identificar y extraer la información para cada fila, mapeando los datos a una estructura específica.
Las columnas pueden tener nombres variables o estar en español.
Debes identificar las siguientes columnas semánticas:
- CUIT: El CUIT o RUT del cliente. Busca columnas como 'Identificador Contacto', 'CUIT', 'RUT'.
- Cliente: El nombre del cliente. Busca columnas como 'Contacto', 'Cliente', 'Razón Social'.
- Código: El código o SKU del producto. Busca columnas como 'Código', 'SKU', 'cod'.
- Descripción: La descripción del producto. Busca columnas como 'Artículo', 'Descripción', 'Producto'.
- Precio Unitario: El precio del producto. Busca columnas como 'Precio Unitario', 'Precio', 'Valor'.
- Fecha: La fecha de la venta o del precio. Busca columnas como 'Fecha'.
- IVA: El porcentaje de IVA (ej. 22, 10, 0). Si no está, usa 22.
- Moneda: La moneda del precio (ej. UYU, $, USD, U$D). Si no está, asume UYU.

Procesa cada objeto del array de entrada y devuelve un nuevo array de objetos JSON con la siguiente estructura FIJA:
{
  "cuit": "string",
  "clienteNombre": "string",
  "codigo": "string",
  "productoDesc": "string",
  "precioUnitario": number,
  "fecha": "YYYY-MM-DD",
  "iva": number,
  "moneda": "string"
}

- Asegúrate de que los valores numéricos como el precio sean números (sin símbolos de moneda), no strings.
- Las fechas deben ser normalizadas al formato YYYY-MM-DD.
- El IVA debe ser un número (22, 10, 0).
- La Moneda debe ser 'UYU' o 'USD'. Interpreta '$' y 'pesos' como 'UYU', y 'U$D' o 'dólares' como 'USD'.
- Si una fila no contiene datos válidos para cuit, codigo y precioUnitario, omítela del resultado.
- La respuesta DEBE ser únicamente el array JSON, sin texto adicional, explicaciones, ni estar envuelto en markdown.

Datos de entrada:
---
{{datos}}
---`,
  },
];

/** Agrega los prompts que falten (no pisa los que ya se editaron). */
export async function seedPrompts(): Promise<void> {
  for (const p of DEFAULT_PROMPTS) {
    await getPool().query(
      "INSERT IGNORE INTO ai_prompts (id, slug, name, description, prompt_text) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), p.slug, p.name, p.description, p.prompt_text],
    );
  }
}

/** Devuelve el prompt (editado o por defecto) con las variables reemplazadas. */
export async function renderPrompt(slug: string, vars: Record<string, string>): Promise<string> {
  const [row] = await querySql<{ prompt_text: string | null }>("SELECT prompt_text FROM ai_prompts WHERE slug = ?", [slug]);
  const template = row?.prompt_text?.trim() || DEFAULT_PROMPTS.find((p) => p.slug === slug)!.prompt_text;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}
