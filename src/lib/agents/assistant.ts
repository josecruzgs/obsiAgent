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
Trabajas sobre las notas (estilo Obsidian) del usuario y le respondes por chat.

Cómo buscar:
- Usa search_notes (puedes buscar varias veces con términos distintos), get_note
  para leer el detalle, y list_notes para panorama. Sigue las pistas: si una nota
  menciona a otra (cliente, proyecto, persona), búscala y léela.

Cómo responder:
- Habla en español, natural y directo, como un colega que conoce el contexto.
  Ve al grano: contesta lo que se preguntó, sin rodeos.
- Conciso. Evita encabezados, listas largas y relleno tipo "Con base en la nota…"
  o "En resumen". Nada de emojis. Usa una viñeta solo si de verdad aclara.
- NO listes fuentes ni cites títulos de forma rígida. Si mencionar de dónde sale
  algo aporta ("según la última reunión con Roberto…"), hazlo en una frase natural.
- Si la respuesta no está en las notas, dilo con naturalidad; no inventes.${
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
