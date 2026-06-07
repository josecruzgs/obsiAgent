// Agente de reuniones (Fase 1). En vez de solo resumir la transcripción, usa
// herramientas para BUSCAR notas existentes (identificar el cliente/proyecto y
// contexto previo) y produce un resumen en Markdown que ENLAZA a esas notas con
// [[Título]]. El orchestrator (teamsSync) ingiere el Markdown resultante.
import { runAgent } from "../agent/runtime";
import { buildReadTools } from "../agent/tools";
import type { Scope } from "../scope";

const SYSTEM = `Eres un asistente que documenta reuniones de trabajo en la base de
conocimiento (Obsidian) de una consultoría de software. Trabajas para una empresa
que tiene varios clientes y proyectos, cada uno con su propia nota.

Tienes herramientas para BUSCAR y LEER notas existentes. Úsalas para:
- Identificar a qué cliente o proyecto pertenece la reunión (búscalo por nombre/tema).
- Recuperar contexto previo relevante (reuniones o acuerdos anteriores) si ayuda.
No hagas más de unas pocas búsquedas; ve al grano.

Luego produce un RESUMEN en español, en Markdown, con esta estructura (omite una
sección si no hay contenido; NO inventes datos que no estén en la transcripción):

## Resumen
2 a 4 frases con el objetivo y las conclusiones.

## Puntos clave
- viñetas con temas y decisiones

## Acuerdos y tareas
- [ ] responsable (si se menciona) — tarea concreta

## Participantes
- nombres de los hablantes que aparezcan

Si identificaste notas existentes relevantes (p. ej. la nota del cliente/proyecto),
enlázalas al final dentro del cuerpo usando [[Título exacto]] — usa el título tal
como aparece en search_notes; NO inventes enlaces a notas que no existen.

Cuando termines, responde ÚNICAMENTE con el Markdown del resumen, sin preámbulo
ni comentarios sobre tu proceso.`;

/** Genera el resumen enriquecido (con enlaces) de una reunión. Devuelve Markdown. */
export async function runMeetingAgent(
  transcript: string,
  fecha: string,
  titulo: string,
  scope: Scope
): Promise<string> {
  const prompt = `Transcripción de la reunión${fecha ? ` del ${fecha}` : ""}${
    titulo ? ` (asunto: "${titulo}")` : ""
  }:

<transcripcion>
${transcript.slice(0, 60000)}
</transcripcion>`;

  const r = await runAgent({
    system: SYSTEM,
    tools: buildReadTools(scope),
    prompt,
    maxSteps: 8,
    maxTokens: 2000,
    label: "meeting",
  });
  return r.text.trim();
}
