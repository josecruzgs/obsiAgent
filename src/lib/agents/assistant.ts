// Agente asistente (Fase 2): responde preguntas sobre el conocimiento del
// usuario haciendo búsquedas múltiples, leyendo notas y siguiendo enlaces
// (RAG agéntico, #3). Con allowWrite también puede crear notas cuando se le
// pide explícitamente (acciones de WhatsApp, #5).
import { runAgent } from "../agent/runtime";
import { buildUserReadTools, createNoteTool } from "../agent/tools";
import { companyScope } from "../scope";
import { query } from "../db";
import type { User } from "../tenancy";

export interface AssistantResult {
  answer: string;
  sources: { id: string; title: string | null }[];
}

export interface AssistantOptions {
  allowWrite?: boolean; // habilita create_note (WhatsApp)
  label?: string; // etiqueta para el log
}

export async function runAssistant(
  question: string,
  user: User,
  opts: AssistantOptions = {}
): Promise<AssistantResult> {
  const sources = new Set<string>();
  const tools = buildUserReadTools(user, sources);
  if (opts.allowWrite) {
    tools.push(createNoteTool(companyScope(user.company_id), "whatsapp"));
  }

  const system = `Eres el asistente de conocimiento de una consultoría de software.
Trabajas sobre el "vault" (notas estilo Obsidian) del usuario.

- Responde ÚNICAMENTE con información del vault. Usa search_notes (puedes buscar
  varias veces con términos distintos), get_note para leer el detalle de una nota
  y list_notes para tener panorama.
- Sigue las pistas: si una nota menciona a otra (cliente, proyecto, persona),
  búscala y léela antes de concluir.
- Responde en español, claro y conciso. Cita entre comillas los títulos de las
  notas en las que te apoyaste.
- Si la respuesta no está en el vault, dilo claramente; no inventes.${
    opts.allowWrite
      ? `\n- Si el usuario pide EXPLÍCITAMENTE guardar o crear una nota, usa create_note. No crees notas para responder preguntas.`
      : ""
  }`;

  const r = await runAgent({
    system,
    tools,
    prompt: question,
    maxSteps: 6,
    maxTokens: 1200,
    label: opts.label ?? (opts.allowWrite ? "whatsapp" : "search"),
  });

  const ids = [...sources];
  const rows = ids.length
    ? await query<{ id: string; title: string | null }>(
        `select id, title from notes where id = any($1::text[])`,
        [ids]
      )
    : [];

  return { answer: r.text, sources: rows };
}
