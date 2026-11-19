// Proveedor de IA: Gemini (GEMINI_API_KEY, el que usaba el sistema original),
// OpenAI (OPENAI_API_KEY) o Claude (ANTHROPIC_API_KEY). Las claves nunca llegan al navegador.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Provider = "gemini" | "openai" | "claude";

const KEYS: Record<Provider, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY" };

/** AI_PROVIDER fija el proveedor; si no, se usa el primero con clave: Gemini, OpenAI, Claude. */
export function aiProvider(): Provider {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" || forced === "openai" || forced === "claude") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return "gemini";
}

/** Quita espacios y comillas que suelen colarse al pegar una clave. */
const cleanKey = (key: string | undefined) => (key ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

let gemini: GoogleGenAI | null = null;
let openai: OpenAI | null = null;
let claude: Anthropic | null = null;

const errorStatus = (error: unknown) => (error as { status?: number })?.status;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Errores pasajeros de Google (saturación, límite momentáneo, falla interna): vale la pena reintentar. */
const isTransient = (status: number | undefined) => status === 429 || status === 500 || status === 503 || status === 504;

/**
 * Modelo principal (GEMINI_MODEL) y, si está saturado, los de respaldo (GEMINI_FALLBACK_MODELS,
 * separados por coma). Por defecto se prueba el alias "flash" más reciente y luego "flash-lite".
 */
function geminiModels(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-latest,gemini-flash-lite-latest")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

async function withGemini(prompt: string): Promise<string> {
  gemini ??= new GoogleGenAI({
    apiKey: cleanKey(process.env.GEMINI_API_KEY),
    vertexai: process.env.GEMINI_VERTEXAI === "true",
  });
  const models = geminiModels();
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    // Dos intentos por modelo, con una pausa corta entre ellos.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await gemini.models.generateContent({ model, contents: prompt });
        return response.text ?? "";
      } catch (error) {
        lastError = error;
        const status = errorStatus(error);
        if (status === 401 || status === 403) throw new AiError(500, `Google rechazó GEMINI_API_KEY: ${errorText(error)}`);
        // Un modelo de respaldo inexistente para esta clave no debe cortar la cadena.
        if (status === 404) {
          if (index === 0 && models.length === 1) {
            throw new AiError(500, `El modelo de Gemini no está disponible para esta clave: ${errorText(error)}`);
          }
          break;
        }
        if (!isTransient(status)) throw new AiError(502, `Error de la API de Gemini: ${errorText(error)}`);
        console.warn(`Gemini ${model} respondió ${status}; ${attempt === 0 ? "reintentando" : "probando otro modelo"}.`);
        if (attempt === 0) await sleep(1500 + Math.random() * 1000);
      }
    }
  }
  const status = errorStatus(lastError);
  if (status === 429) throw new AiError(429, "Límite de uso de Gemini alcanzado. Intentá más tarde.");
  if (status === 404) throw new AiError(500, `Ningún modelo de Gemini está disponible para esta clave: ${errorText(lastError)}`);
  throw new AiError(503, "Gemini está saturado en este momento (alta demanda en Google). Probá de nuevo en unos minutos.");
}

async function withOpenAI(prompt: string): Promise<string> {
  openai ??= new OpenAI({ apiKey: cleanKey(process.env.OPENAI_API_KEY) });
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const isReasoningModel = /^(gpt-5|o\d)/i.test(model);
  try {
    const completion = await openai.chat.completions.create({
      model,
      ...(isReasoningModel ? { reasoning_effort: "low" as const } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) throw new AiError(500, "OpenAI rechazó OPENAI_API_KEY.");
    if (error instanceof OpenAI.RateLimitError) throw new AiError(429, "Límite de uso o saldo de OpenAI agotado.");
    throw new AiError(502, `Error de la API de OpenAI: ${errorText(error)}`);
  }
}

async function withClaude(prompt: string): Promise<string> {
  claude ??= new Anthropic({ apiKey: cleanKey(process.env.ANTHROPIC_API_KEY) });
  try {
    const stream = claude.messages.stream({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 32000,
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiError(500, "ANTHROPIC_API_KEY inválida.");
    if (error instanceof Anthropic.RateLimitError) throw new AiError(429, "Límite de uso de Claude alcanzado. Intentá más tarde.");
    throw new AiError(502, `Error de la API de Claude: ${errorText(error)}`);
  }
}

/** Genera texto con el proveedor configurado. */
export async function generateText(prompt: string): Promise<string> {
  const provider = aiProvider();
  if (!process.env[KEYS[provider]]) {
    throw new AiError(500, `No hay clave de IA configurada (falta ${KEYS[provider]} en las variables de entorno).`);
  }
  const text =
    provider === "gemini" ? await withGemini(prompt) : provider === "openai" ? await withOpenAI(prompt) : await withClaude(prompt);
  if (!text.trim()) throw new AiError(502, "La IA no devolvió contenido. Probá de nuevo.");
  return text;
}

/** Extrae el primer objeto ({...}) o array ([...]) JSON del texto de la IA. */
export function extractJson<T = unknown>(text: string, kind: "object" | "array"): T {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const match = kind === "object" ? cleaned.match(/\{[\s\S]*\}/) : cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new AiError(502, `La respuesta de la IA no contiene un ${kind === "object" ? "objeto" : "array"} JSON válido.`);
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    throw new AiError(502, "La IA devolvió un JSON mal formado. Probá de nuevo.");
  }
}
