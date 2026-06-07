// Runtime mínimo de agente sobre el SDK de Anthropic: un loop manual de "tool
// use" (mensaje → el modelo decide herramientas → las ejecutamos → repetimos
// hasta end_turn). Es la base compartida de los agentes (reuniones, status,
// buscador, etc.). Cada agente = system prompt + subconjunto de herramientas.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

// Cliente perezoso (no instancia al importar; igual que claude.ts).
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey });
  return _client;
}

/** Una herramienta: su definición (esquema) + el ejecutor. El ejecutor recibe
 *  el input ya parseado y devuelve texto (lo que ve el modelo como resultado). */
export interface AgentTool {
  def: Anthropic.Tool;
  run: (input: Record<string, unknown>) => Promise<string>;
}

export interface RunAgentOptions {
  system: string;
  tools: AgentTool[];
  prompt: string; // primer mensaje del usuario
  maxSteps?: number; // tope de iticiones del loop (default 8)
  model?: string; // override del modelo (default env.anthropicAgentModel)
  maxTokens?: number; // default 4096
  label?: string; // etiqueta para el log (p. ej. "meeting", "search")
}

export interface RunAgentResult {
  text: string; // texto final del asistente
  steps: number; // cuántas vueltas dio el loop
  toolCalls: { name: string; input: unknown }[];
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Corre un agente hasta que el modelo deja de pedir herramientas (end_turn) o
 *  se agota maxSteps. Loop manual para tener control de scope/errores/límites. */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const maxSteps = opts.maxSteps ?? 8;
  const model = opts.model ?? env.anthropicAgentModel;
  const maxTokens = opts.maxTokens ?? 4096;

  const toolDefs = opts.tools.map((t) => t.def);
  const byName = new Map(opts.tools.map((t) => [t.def.name, t]));
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.prompt },
  ];
  const toolCalls: { name: string; input: unknown }[] = [];
  const tag = opts.label ? `agent:${opts.label}` : "agent";

  let steps = 0;
  let lastText = "";

  while (steps < maxSteps) {
    steps++;
    const resp = await client().messages.create({
      model,
      max_tokens: maxTokens,
      system: opts.system,
      tools: toolDefs,
      messages,
    });
    messages.push({ role: "assistant", content: resp.content });
    lastText = textOf(resp.content) || lastText;

    if (resp.stop_reason !== "tool_use") {
      console.log(
        `[${tag}] pasos=${steps} tools=${
          toolCalls.map((c) => c.name).join(",") || "(ninguna)"
        }`
      );
      return { text: textOf(resp.content), steps, toolCalls };
    }

    const uses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      toolCalls.push({ name: use.name, input: use.input });
      const tool = byName.get(use.name);
      try {
        if (!tool) throw new Error(`Herramienta desconocida: ${use.name}`);
        const out = await tool.run((use.input ?? {}) as Record<string, unknown>);
        results.push({ type: "tool_result", tool_use_id: use.id, content: out });
      } catch (err) {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  // Se agotó maxSteps: una última llamada SIN herramientas para forzar respuesta.
  console.log(
    `[${tag}] límite de pasos (${maxSteps}) tools=${toolCalls
      .map((c) => c.name)
      .join(",")}`
  );
  try {
    const final = await client().messages.create({
      model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "Has alcanzado el límite de pasos. Responde ahora con el resultado final solicitado, sin usar más herramientas.",
        },
      ],
    });
    return { text: textOf(final.content) || lastText, steps, toolCalls };
  } catch {
    return { text: lastText, steps, toolCalls };
  }
}
