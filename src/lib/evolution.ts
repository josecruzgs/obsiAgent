// Cliente mínimo para enviar mensajes de WhatsApp vía Evolution API.
import { env } from "./env";

interface EvoContact {
  remoteJid?: string;
  profilePicUrl?: string | null;
}

/** Parte estable de la URL de la foto de perfil (sin los query params firmados,
 *  que cambian con el tiempo). Sirve para emparejar contactos de la misma persona. */
function picKey(url?: string | null): string {
  return url ? url.split("?")[0] : "";
}

/** Lista los contactos de la instancia (vacío si no hay conexión). */
async function findContacts(): Promise<EvoContact[]> {
  const { url, apiKey, instance } = env.evolution;
  if (!url) return [];
  const res = await fetch(`${url}/chat/findContacts/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({}),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as EvoContact[] | { contacts?: EvoContact[] };
  return Array.isArray(data) ? data : data.contacts ?? [];
}

/** Resuelve un jid de LID (`<id>@lid`) al jid de teléfono real
 *  (`<numero>@s.whatsapp.net`) emparejando por foto de perfil. null si no se puede. */
export async function resolvePhoneJid(lidJid: string): Promise<string | null> {
  const contacts = await findContacts();
  const lid = contacts.find((c) => c.remoteJid === lidJid);
  const key = picKey(lid?.profilePicUrl);
  if (!key) return null;
  const pn = contacts.find(
    (c) =>
      c.remoteJid?.endsWith("@s.whatsapp.net") && picKey(c.profilePicUrl) === key
  );
  return pn?.remoteJid ?? null;
}

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
