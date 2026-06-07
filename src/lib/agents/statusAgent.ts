// Agente de status por cliente/proyecto (Fase 3, #2). Reúne las notas y
// reuniones de un cliente y produce una nota de ESTADO viva (resumen, tareas
// abiertas, decisiones recientes, próximos pasos, riesgos). El orchestrator
// (lib/status.ts) la guarda/actualiza de forma idempotente.
import { runAgent } from "../agent/runtime";
import { buildReadTools } from "../agent/tools";
import type { Scope } from "../scope";

const SYSTEM = `Eres un asistente que mantiene una nota de ESTADO viva por cliente
o proyecto, en la base de conocimiento de una consultoría de software.

Tienes herramientas para BUSCAR y LEER notas. Úsalas para reunir TODO lo relevante
del cliente/proyecto indicado: su nota principal, reuniones de seguimiento,
acuerdos, tareas y decisiones. Haz varias búsquedas con términos distintos
(nombre del cliente, del proyecto, "reunión", "acuerdos", "tareas").

Luego produce en español, en Markdown, una nota de estado CONCISA y ACCIONABLE:

## Estado general
2-4 frases: en qué punto está el proyecto/relación.

## Tareas abiertas
- [ ] responsable (si se conoce) — tarea — origen (de qué reunión/nota)

## Decisiones recientes
- decisión — cuándo/dónde

## Próximos pasos
- ...

## Riesgos / pendientes
- ... (si aplica)

Reglas:
- Básate SOLO en lo que encuentres en las notas; no inventes.
- Si una tarea ya se ve resuelta en una reunión posterior, no la pongas como abierta.
- Enlaza las notas fuente relevantes con [[Título exacto]] (como aparecen en search_notes).
- Si no encuentras información del cliente, dilo en una línea.

Cuando termines, responde ÚNICAMENTE con el Markdown de la nota de estado.`;

/** Produce el Markdown de la nota de estado de un cliente/proyecto. */
export async function runStatusAgent(
  cliente: string,
  estadoPrevio: string | null,
  scope: Scope
): Promise<string> {
  const prompt = `Cliente/proyecto: "${cliente}".

${
  estadoPrevio
    ? `Estado anterior (actualízalo con lo más reciente que encuentres):\n\n${estadoPrevio.slice(
        0,
        4000
      )}\n\n---\n`
    : ""
}Reúne la información de este cliente/proyecto en las notas y genera su nota de estado.`;

  const r = await runAgent({
    system: SYSTEM,
    tools: buildReadTools(scope),
    prompt,
    maxSteps: 10,
    maxTokens: 2000,
    label: "status",
  });
  return r.text.trim();
}
