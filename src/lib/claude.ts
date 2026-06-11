// Integración con Claude (Anthropic): digestión de documentos raw y respuestas RAG.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./env";
import type { DigestResult, RetrievedNote } from "./types";

// Cliente perezoso: no se instancia al importar (para no requerir la API key
// durante `next build`).
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey });
  return _client;
}

const digestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  suggestedLinks: z.array(z.string()).default([]),
});

/** Extrae el primer bloque JSON de un texto (por si el modelo añade prosa). */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

// Muestreo para la digestión: para extraer metadatos (título/resumen/tags) no
// hace falta el documento entero. Si es largo, enviamos cabeza + cola —donde
// suele concentrarse lo esencial— en vez de los primeros 40k chars. Recorta el
// componente más grande del input por documento.
const DIGEST_HEAD = 12000;
const DIGEST_TAIL = 4000;
function sampleForDigest(raw: string): string {
  if (raw.length <= DIGEST_HEAD + DIGEST_TAIL) return raw;
  return `${raw.slice(0, DIGEST_HEAD)}\n\n[…fragmento omitido…]\n\n${raw.slice(
    -DIGEST_TAIL
  )}`;
}

/**
 * "Digiere" un documento raw: genera título, resumen, tags y propone enlaces a
 * notas existentes. `candidateTitles` son los títulos a los que se PUEDE enlazar
 * (todos los del ámbito si es pequeño, o solo los vecinos más cercanos si es
 * grande). `opts.cacheTitles` marca ese bloque como cacheable: hazlo solo cuando
 * la lista sea estable entre ingestas (vault pequeño); con candidatos que varían
 * por documento, cachear solo añade costo de escritura sin lecturas que lo amorticen.
 */
export async function digestDocument(
  raw: string,
  candidateTitles: string[],
  hintTitle?: string,
  opts: { cacheTitles?: boolean } = {}
): Promise<DigestResult> {
  const titlesBlock =
    candidateTitles.length > 0
      ? candidateTitles.map((t) => `- ${t}`).join("\n")
      : "(el vault está vacío todavía)";

  const titlesText = `Notas existentes en el vault (usa estos títulos EXACTOS para suggestedLinks):\n${titlesBlock}`;
  const system = [
    {
      type: "text" as const,
      text:
        "Eres un asistente que organiza una base de conocimiento en Obsidian. " +
        "Dado un documento, produces metadatos en español y propones enlaces " +
        "ÚNICAMENTE hacia notas que ya existen. Respondes SIEMPRE con un único " +
        "objeto JSON válido, sin texto adicional.",
    },
    {
      type: "text" as const,
      text: titlesText,
      // Cacheable solo si la lista es estable (vault pequeño): así un lote entero
      // de ingestas reusa el mismo prefijo y pega cache en cada documento.
      ...(opts.cacheTitles
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    },
  ];

  const userPrompt = `Documento a digerir${
    hintTitle ? ` (título sugerido por el usuario: "${hintTitle}")` : ""
  }:

<documento>
${sampleForDigest(raw)}
</documento>

Devuelve un JSON con esta forma exacta:
{
  "title": "título conciso y descriptivo",
  "summary": "resumen de 2-4 frases del contenido",
  "tags": ["tag1", "tag2"],
  "suggestedLinks": ["Título de nota existente relevante", "..."]
}

Reglas:
- "suggestedLinks" debe contener solo títulos que aparezcan EXACTAMENTE en la lista de notas existentes; si ninguna es relevante, devuelve [].
- "tags" en minúsculas, sin "#", máximo 6.`;

  // Auditoría: deja constancia en los logs de QUÉ modelo digiere (verificable con
  // `docker compose logs app | grep "\[digest\] modelo"`).
  console.log("[digest] modelo:", env.anthropicDigestModel);
  const msg = await client().messages.create({
    model: env.anthropicDigestModel,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = digestSchema.parse(JSON.parse(extractJson(text)));

  // Filtra enlaces a notas que de verdad existen (defensa extra).
  const existingSet = new Set(candidateTitles);
  parsed.suggestedLinks = parsed.suggestedLinks.filter((l) => existingSet.has(l));

  return parsed;
}

const classifySchema = z.object({
  cliente: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
});

/** Clasifica una nota: a qué cliente/proyecto pertenece (de una lista conocida)
 *  y tags sugeridos. Una sola llamada (modelo rápido). cliente = null si ninguno. */
export async function classifyNote(
  text: string,
  clients: string[]
): Promise<{ cliente: string | null; tags: string[] }> {
  const lista = clients.length
    ? clients.map((c) => `- ${c}`).join("\n")
    : "(no hay clientes/proyectos conocidos)";

  const msg = await client().messages.create({
    model: env.anthropicAnswerModel,
    max_tokens: 300,
    system:
      "Clasificas notas de una consultoría de software. Respondes SIEMPRE con un " +
      "único objeto JSON válido, sin texto adicional.",
    messages: [
      {
        role: "user",
        content: `Clientes/proyectos conocidos:\n${lista}\n\nNota a clasificar:\n<nota>\n${text.slice(
          0,
          6000
        )}\n</nota>\n\nDevuelve JSON con esta forma:\n{ "cliente": "<EXACTAMENTE uno de la lista, o null si ninguno aplica>", "tags": ["3-5 tags en minúsculas, sin #"] }`,
      },
    ],
  });

  const out = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = classifySchema.parse(JSON.parse(extractJson(out)));
    // Solo acepta un cliente que esté en la lista (evita inventos).
    const cliente =
      parsed.cliente && clients.includes(parsed.cliente) ? parsed.cliente : null;
    return { cliente, tags: parsed.tags.slice(0, 5) };
  } catch {
    return { cliente: null, tags: [] };
  }
}

/**
 * Resume una transcripción de reunión en Markdown estructurado (resumen, puntos
 * clave, acuerdos/tareas, participantes). Lo que se ingiere al vault es ESTE
 * resumen, no la transcripción cruda. Fiel: no inventa lo que no esté dicho.
 */
export async function summarizeMeeting(
  transcript: string,
  fecha: string,
  hintTitle?: string
): Promise<string> {
  const userPrompt = `Transcripción de una reunión${fecha ? ` del ${fecha}` : ""}${
    hintTitle ? ` (asunto: "${hintTitle}")` : ""
  }:

<transcripcion>
${transcript.slice(0, 60000)}
</transcripcion>

Devuelve SOLO Markdown en español con esta estructura (omite una sección si no
hay contenido para ella; no inventes datos que no estén en la transcripción):

## Resumen
2 a 4 frases con el objetivo y las conclusiones de la reunión.

## Puntos clave
- viñetas con los temas y decisiones tratados

## Acuerdos y tareas
- [ ] responsable (si se menciona) — tarea concreta

## Participantes
- nombres de los hablantes que aparezcan`;

  const msg = await client().messages.create({
    model: env.anthropicModel,
    max_tokens: 1500,
    system:
      "Eres un asistente que resume reuniones de trabajo en español. Produces un " +
      "resumen claro, fiel y bien estructurado en Markdown. Nunca inventas " +
      "información que no esté presente en la transcripción.",
    messages: [{ role: "user", content: userPrompt }],
  });

  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Responde una pregunta usando los fragmentos recuperados como contexto (RAG).
 * `overview` (opcional) es el índice/MOC del vault: da panorama para preguntas
 * amplias aunque no haya notas detalladas relevantes.
 */
export async function answerWithContext(
  question: string,
  notes: RetrievedNote[],
  overview?: string
): Promise<string> {
  if (notes.length === 0 && !overview) {
    return "No encontré información relevante en el vault para responder eso.";
  }

  const parts: string[] = [];
  if (overview) {
    parts.push(
      `Índice general del vault (panorama de TODAS las notas, úsalo para preguntas amplias):\n${overview.slice(
        0,
        8000
      )}`
    );
  }
  if (notes.length > 0) {
    const context = notes
      .map(
        (n, i) =>
          `[${i + 1}] ${n.title ?? n.id}\n${(n.content ?? n.summary ?? "").slice(
            0,
            4000
          )}`
      )
      .join("\n\n---\n\n");
    parts.push(`Notas relevantes con detalle:\n\n${context}`);
  }

  const msg = await client().messages.create({
    model: env.anthropicAnswerModel,
    max_tokens: 1024,
    system:
      "Eres un asistente que responde preguntas basándote EXCLUSIVAMENTE en la " +
      "información del vault del usuario que se te proporciona (índice general y/o " +
      "notas con detalle). Responde en español, de forma concisa. Cuando uses una " +
      "nota con detalle, cítala con su número entre corchetes, p. ej. [1]. Para " +
      "preguntas amplias, apóyate en el índice general. Si la respuesta no está en " +
      "el material, dilo claramente.",
    messages: [
      {
        role: "user",
        content: `${parts.join("\n\n====\n\n")}\n\n---\n\nPregunta: ${question}`,
      },
    ],
  });

  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
