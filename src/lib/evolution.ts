// Cliente mínimo para enviar mensajes de WhatsApp vía Evolution API.
import { env } from "./env";

/** Envía un mensaje de texto a un número por la instancia configurada. */
export async function sendText(number: string, text: string): Promise<void> {
  const { url, apiKey, instance } = env.evolution;
  if (!url) {
    console.warn("[evolution] EVOLUTION_API_URL no configurada; no se envía.");
    return;
  }

  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number, text }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Evolution sendText error ${res.status}: ${detail}`);
  }
}

/** ¿Está permitido este número para consultar el vault? (allowlist) */
export function isAllowed(number: string): boolean {
  const allowed = env.whatsappAllowedNumbers;
  if (allowed.length === 0) return true; // vacío = todos (no recomendado en prod)
  const normalized = number.replace(/\D/g, "");
  return allowed.some((a) => normalized.endsWith(a) || a.endsWith(normalized));
}
