// Agente asistente (Fase 2): responde preguntas sobre el conocimiento del
// usuario haciendo búsquedas múltiples, leyendo notas y siguiendo enlaces
// (RAG agéntico, #3). Con allowWrite también puede crear notas cuando se le
// pide explícitamente (acciones de WhatsApp, #5).
import { runAgent } from "../agent/runtime";
import { buildUserReadTools, createNoteTool } from "../agent/tools";
import { companyScope } from "../scope";
import { query } from "../db";
import { env } from "../env";
import type { User } from "../tenancy";

export interface AssistantResult {
  answer: string;
  sources: { id: string; title: string | null }[];
}

export interface AssistantOptions {
  allowWrite?: boolean; // habilita create_note (WhatsApp)
  label?: string; // etiqueta para el log
  history?: { role: "user" | "assistant"; content: string }[]; // turnos previos
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

  const voice = opts.label === "voice";
  const system = `Eres el asistente de conocimiento de una consultoría de software.
Trabajas sobre las notas (estilo Obsidian) del usuario y le respondes ${
    voice ? "por TELÉFONO (en voz alta)" : "por chat"
  }.${
    voice
      ? `\n\nIMPORTANTE (llamada de voz): responde MUY breve (1-3 frases), en lenguaje hablado natural, SIN listas, viñetas, markdown ni emojis. Si necesitas más detalle, ofrécelo y espera a que lo pidan.`
      : ""
  }

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
  }

Contexto de la conversación:
- Tienes el historial reciente de este chat. ÚSALO para resolver referencias como
  "ese dato", "esa nota", "lo anterior", "y entonces…": se refieren a lo que ya
  hablaron. Si antes confirmaste un dato o leíste una nota, recuérdalo y sigue el
  hilo en lugar de preguntar "¿en base a qué nota?". Si de verdad hay ambigüedad,
  vuelve a buscar en las notas antes de decir que no sabes.`;

  const r = await runAgent({
    system,
    tools,
    prompt: question,
    history: opts.history,
    maxSteps: 5,
    maxTokens: 900,
    // Modelo rápido para el chat (Haiku): prioriza latencia sobre profundidad.
    // Los agentes de reuniones/status usan el modelo más capaz por defecto.
    model: env.anthropicAnswerModel,
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
