// Estimador de costos de las APIs que usa el sistema. TODO aquí es aproximado y
// editable: ajusta PRICING si cambian las tarifas, o los supuestos de tokens/min
// por interacción si tu uso real difiere. Sirve para dar una idea de magnitud,
// no es una factura.
//
// Modelos reales en uso (ver src/lib/env.ts y src/lib/audio.ts):
//   - claude-haiku-4-5    → digestión de documentos (ANTHROPIC_DIGEST_MODEL),
//                           respuestas RAG (/buscador) y clasificación
//   - claude-sonnet-4-6  → resúmenes de reuniones (agente, ANTHROPIC_AGENT_MODEL)
//   - voyage-3.5          → embeddings (búsqueda semántica)
//   - whisper-1           → voz→texto (WhatsApp)
//   - gpt-4o-mini-tts     → texto→voz (WhatsApp)
//   - Retell AI           → agente de voz por teléfono
//
// Ahorros en la ingesta (ver [[ingest-token-savings]]): la digestión pasó de
// Sonnet a Haiku, el doc se trunca a cabeza+cola (~16k chars en vez de 40k) y
// las re-ingestas idénticas / notas muy cortas no llaman a Claude (no se
// modelan aquí: el costo unitario asume un documento NUEVO y largo).

// Precios aproximados (USD). Ajusta aquí si cambian las tarifas.
export const PRICING = {
  // Anthropic — USD por 1M tokens (entrada / salida).
  sonnet: { in: 3, out: 15 }, // claude-sonnet-4-6
  haiku: { in: 1, out: 5 }, //   claude-haiku-4-5
  // Voyage embeddings — USD por 1M tokens.
  voyage: 0.06, //               voyage-3.5
  // OpenAI audio — USD por minuto de audio.
  whisper: 0.006, //             whisper-1 (voz→texto)
  tts: 0.015, //                 gpt-4o-mini-tts (texto→voz, ~)
  // Retell AI voz — USD por minuto (incluye ASR+LLM+TTS aprox; telefonía aparte).
  retellPerMin: 0.08,
};

type Model = { in: number; out: number };

// Costo de una llamada a un modelo de chat, dados tokens de entrada/salida.
function chat(inTok: number, outTok: number, m: Model): number {
  return (inTok * m.in + outTok * m.out) / 1_000_000;
}
// Costo de un embedding (solo tokens de entrada).
function embed(tok: number): number {
  return (tok * PRICING.voyage) / 1_000_000;
}

export interface Interaction {
  key: string;
  label: string;
  hint: string; // qué consume (tooltip)
  defaultQty: number; // volumen mensual típico (editable en la UI)
  unitCost: number; // USD por interacción
}

// Supuestos de uso promedio por interacción. Cifras conservadoras; cámbialas si
// tu realidad difiere.
export const INTERACTIONS: Interaction[] = [
  {
    key: "doc",
    label: "Documento ingerido",
    hint: "Haiku digiere el doc truncado (~5k tok entrada, ~500 salida) + embedding Voyage. Re-ingestas idénticas y notas muy cortas no llaman a Claude.",
    defaultQty: 50,
    unitCost: chat(5_000, 500, PRICING.haiku) + embed(8_000),
  },
  {
    key: "pregunta",
    label: "Pregunta (buscador)",
    hint: "Haiku responde con contexto RAG (~6k tok entrada, ~400 salida) + embedding de la consulta",
    defaultQty: 200,
    unitCost: chat(6_000, 400, PRICING.haiku) + embed(200),
  },
  {
    key: "reunion",
    label: "Resumen de reunión",
    hint: "Sonnet resume la transcripción (~18k tok entrada, ~1.2k salida)",
    defaultQty: 20,
    unitCost: chat(18_000, 1_200, PRICING.sonnet),
  },
  {
    key: "whatsapp",
    label: "Mensaje WhatsApp (voz)",
    hint: "Whisper (~0.5 min) + Haiku responde + TTS (~0.5 min)",
    defaultQty: 100,
    unitCost:
      0.5 * PRICING.whisper +
      chat(5_000, 300, PRICING.haiku) +
      0.5 * PRICING.tts,
  },
  {
    key: "llamada",
    label: "Llamada de voz (Retell)",
    hint: "Agente de voz Retell, ~3 min por llamada",
    defaultQty: 30,
    unitCost: 3 * PRICING.retellPerMin,
  },
];

// Formato USD: 3 decimales para montos pequeños (costo unitario), 2 para el resto.
export function fmtUSD(n: number): string {
  const d = n !== 0 && Math.abs(n) < 0.1 ? 3 : 2;
  return `$${n.toFixed(d)}`;
}
