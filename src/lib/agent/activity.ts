// Registro EN MEMORIA de la actividad de los agentes, para la página de estado.
// Vive en el proceso del servidor (Next standalone = un solo proceso); el cron,
// WhatsApp y la UI pegan a endpoints del mismo proceso, así que las corridas se
// ven todas aquí. Se usa globalThis para sobrevivir al hot-reload en dev.

export interface AgentInfo {
  key: string;
  label: string;
  description: string;
  status: "active" | "soon"; // implementado vs planeado
}

// Catálogo de agentes (el centro "orquestador" es el runtime que los coordina).
export const AGENTS: AgentInfo[] = [
  { key: "meeting", label: "Reuniones", description: "Resume reuniones de Teams y las enlaza", status: "active" },
  { key: "search", label: "Buscador", description: "Responde preguntas sobre el vault (RAG agéntico)", status: "active" },
  { key: "whatsapp", label: "WhatsApp", description: "Responde y crea notas por WhatsApp (texto y voz)", status: "active" },
  { key: "voice", label: "Voz (teléfono)", description: "Atiende llamadas telefónicas (Retell) con el conocimiento", status: "active" },
  { key: "status", label: "Status", description: "Mantiene la nota de estado por cliente", status: "active" },
  { key: "curador", label: "Curador", description: "Detecta near-duplicados y enriquece enlaces del grafo", status: "active" },
  { key: "enrutador", label: "Enrutador", description: "Clasifica notas por cliente/proyecto (tags)", status: "active" },
];

interface Live {
  running: number;
  totalRuns: number;
  lastActiveAt: number | null;
  lastTools: string[];
}

const store: Record<string, Live> =
  ((globalThis as Record<string, unknown>).__agentActivity as Record<string, Live>) ??
  ((globalThis as Record<string, unknown>).__agentActivity = {});

function rec(key: string): Live {
  return (store[key] ??= { running: 0, totalRuns: 0, lastActiveAt: null, lastTools: [] });
}

export function recordStart(key: string): void {
  const r = rec(key);
  r.running += 1;
  r.lastActiveAt = Date.now();
}

export function recordEnd(key: string, tools: string[]): void {
  const r = rec(key);
  r.running = Math.max(0, r.running - 1);
  r.totalRuns += 1;
  r.lastActiveAt = Date.now();
  if (tools.length) r.lastTools = tools.slice(-6);
}

export interface AgentSnapshot extends AgentInfo, Live {}

/** Estado actual de todos los agentes del catálogo. */
export function snapshot(): AgentSnapshot[] {
  return AGENTS.map((a) => ({
    ...a,
    ...(store[a.key] ?? { running: 0, totalRuns: 0, lastActiveAt: null, lastTools: [] }),
  }));
}
