// Memoria conversacional de corto plazo por canal (p. ej. teléfono de WhatsApp).
// En memoria del proceso (un solo contenedor), con tope de turnos y expiración
// por inactividad. Permite que el agente resuelva referencias como "ese dato",
// "esa nota" o "lo anterior" sin perder el hilo.

export type Turn = { role: "user" | "assistant"; content: string };

interface Convo {
  turns: Turn[];
  updated: number;
}

// Persistimos en globalThis para sobrevivir al hot-reload en dev.
const store: Map<string, Convo> =
  (globalThis as unknown as { __waMemory?: Map<string, Convo> }).__waMemory ??
  new Map<string, Convo>();
(globalThis as unknown as { __waMemory?: Map<string, Convo> }).__waMemory = store;

const MAX_TURNS = 12; // ~6 intercambios usuario/asistente
const TTL_MS = 30 * 60_000; // 30 min de inactividad

/** Devuelve los turnos recientes (vacío si no hay o si expiró). */
export function getHistory(key: string): Turn[] {
  const c = store.get(key);
  if (!c) return [];
  if (Date.now() - c.updated > TTL_MS) {
    store.delete(key);
    return [];
  }
  return c.turns;
}

/** Agrega el intercambio (pregunta del usuario + respuesta del asistente). */
export function appendTurn(key: string, userText: string, assistantText: string): void {
  const c = store.get(key) ?? { turns: [], updated: 0 };
  c.turns.push(
    { role: "user", content: userText },
    { role: "assistant", content: assistantText }
  );
  if (c.turns.length > MAX_TURNS) c.turns = c.turns.slice(-MAX_TURNS);
  c.updated = Date.now();
  store.set(key, c);
}

/** Borra el hilo (p. ej. si el usuario escribe "reiniciar"). */
export function clearHistory(key: string): void {
  store.delete(key);
}
