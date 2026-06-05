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

/**
 * "Digiere" un documento raw: genera título, resumen, tags y propone enlaces a
 * notas existentes. `existingTitles` se pasa como contexto cacheable para que el
 * modelo solo enlace a notas reales (no inventadas).
 */
export async function digestDocument(
  raw: string,
  existingTitles: string[],
  hintTitle?: string
): Promise<DigestResult> {
  const titlesBlock =
    existingTitles.length > 0
      ? existingTitles.map((t) => `- ${t}`).join("\n")
      : "(el vault está vacío todavía)";

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
      // Bloque cacheable: la lista de notas existentes cambia poco entre ingestas.
      type: "text" as const,
      text: `Notas existentes en el vault (usa estos títulos EXACTOS para suggestedLinks):\n${titlesBlock}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const userPrompt = `Documento a digerir${
    hintTitle ? ` (título sugerido por el usuario: "${hintTitle}")` : ""
  }:

<documento>
${raw.slice(0, 40000)}
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

  const msg = await client().messages.create({
    model: env.anthropicModel,
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
  const existingSet = new Set(existingTitles);
  parsed.suggestedLinks = parsed.suggestedLinks.filter((l) => existingSet.has(l));

  return parsed;
}

/** Responde una pregunta usando los fragmentos recuperados como contexto (RAG). */
export async function answerWithContext(
  question: string,
  notes: RetrievedNote[]
): Promise<string> {
  if (notes.length === 0) {
    return "No encontré información relevante en el vault para responder eso.";
  }

  const context = notes
    .map(
      (n, i) =>
        `[${i + 1}] ${n.title ?? n.id}\n${(n.content ?? n.summary ?? "").slice(
          0,
          4000
        )}`
    )
    .join("\n\n---\n\n");

  const msg = await client().messages.create({
    model: env.anthropicAnswerModel,
    max_tokens: 1024,
    system:
      "Eres un asistente que responde preguntas basándote EXCLUSIVAMENTE en las " +
      "notas proporcionadas del vault del usuario. Responde en español, de forma " +
      "concisa. Cita las notas usadas con su número entre corchetes, p. ej. [1]. " +
      "Si la respuesta no está en las notas, dilo claramente.",
    messages: [
      {
        role: "user",
        content: `Notas del vault:\n\n${context}\n\n---\n\nPregunta: ${question}`,
      },
    ],
  });

  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
