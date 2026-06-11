// Agente de PÁGINAS DE ENTIDAD/TEMA (patrón "wiki que compone" de la LLM Wiki de
// Karpathy). A diferencia del buscador (que responde y olvida), aquí el LLM
// SINTETIZA en una página viva todo lo que se sabe de un tema a partir de las
// notas, integrando lo nuevo en lo anterior y marcando contradicciones. El
// orquestador (lib/entities.ts) la guarda/actualiza de forma idempotente.
import { runAgent } from "../agent/runtime";
import { buildReadTools } from "../agent/tools";
import { env } from "../env";
import type { Scope } from "../scope";

const SYSTEM = `Eres un bibliotecario que mantiene PÁGINAS DE TEMA vivas (estilo
wiki) en la base de conocimiento de una consultoría de software. Una página de
tema SINTETIZA todo lo que se sabe de un tema a partir de las notas existentes y
se mantiene al día conforme entran nuevas fuentes.

Tienes herramientas para BUSCAR y LEER notas. Reúne TODO lo relevante del tema:
haz varias búsquedas con términos distintos (el tema y sinónimos), lee las notas
con get_note y sigue las pistas hacia notas relacionadas.

Produce en español, en Markdown, una página CONCISA que INTEGRE la información
(no la enumeres fuente por fuente):

## Resumen
2-5 frases con la síntesis actual del tema.

## Hechos clave
- puntos concretos y verificables (menciona la nota fuente cuando aporte)

## Cronología
- fecha o referencia temporal — qué pasó o cambió (omite la sección si no aplica)

## Contradicciones / dudas
- si una fuente contradice a otra, decláralo con ambas; omite la sección si no hay

## Fuentes
- [[Título exacto]] de las notas usadas

Reglas:
- Básate SOLO en lo que encuentres en las notas; no inventes.
- Si recibes una versión ANTERIOR de la página, ACTUALÍZALA integrando lo nuevo
  (no la reescribas desde cero perdiendo lo válido); resalta lo que cambió o lo
  que una fuente reciente contradice.
- Enlaza las fuentes con [[Título exacto]] tal como aparecen en search_notes.
- Si casi no hay información del tema, dilo en una sola línea.

Cuando termines, responde ÚNICAMENTE con el Markdown de la página.`;

/** Produce el Markdown de la página viva de un tema/entidad. */
export async function runEntityAgent(
  name: string,
  tipo: string,
  prevBody: string | null,
  scope: Scope
): Promise<string> {
  const prompt = `${tipo[0].toUpperCase()}${tipo.slice(1)}: "${name}".

${
  prevBody
    ? `Versión anterior de la página (actualízala integrando lo más reciente que encuentres):\n\n${prevBody.slice(
        0,
        4000
      )}\n\n---\n`
    : ""
}Reúne la información de este ${tipo} en las notas y genera/actualiza su página.`;

  const r = await runAgent({
    system: SYSTEM,
    tools: buildReadTools(scope),
    prompt,
    maxSteps: 10,
    maxTokens: 2500,
    model: env.anthropicEntityModel, // Haiku por defecto: acota el costo
    label: "entidad",
  });
  return r.text.trim();
}
