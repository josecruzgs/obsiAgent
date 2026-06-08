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
    // linkPreview:false evita que WhatsApp pre-cargue las URLs (importante para el
    // magic link de un solo uso: una vista previa lo consumiría antes de abrirlo).
    body: JSON.stringify({ number, text, linkPreview: false }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Evolution sendText error ${res.status}: ${detail}`);
  }
}

/** Descarga (descifra) un medio entrante por su key y lo devuelve en base64. */
export async function getMediaBase64(
  messageKey: unknown
): Promise<{ base64: string; mimetype: string } | null> {
  const { url, apiKey, instance } = env.evolution;
  if (!url) return null;
  const res = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
  });
  if (!res.ok) {
    console.error("[evolution] getMedia", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const j = (await res.json()) as { base64?: string; mimetype?: string };
  if (!j.base64) return null;
  return { base64: j.base64, mimetype: j.mimetype || "audio/ogg" };
}

/** Envía una nota de voz (audio) a un número (base64 OGG/Opus). */
export async function sendAudio(to: string, base64Audio: string): Promise<void> {
  const { url, apiKey, instance } = env.evolution;
  if (!url) throw new Error("EVOLUTION_API_URL no configurada.");
  const res = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: to, audio: base64Audio }),
  });
  if (!res.ok) {
    throw new Error(`Evolution sendAudio ${res.status}: ${await res.text()}`);
  }
}

/** Muestra el estado "escribiendo…" en el chat (mejora la percepción de espera). */
export async function sendPresence(
  to: string,
  presence: "composing" | "recording" | "paused" = "composing",
  delayMs = 4000
): Promise<void> {
  const { url, apiKey, instance } = env.evolution;
  if (!url) return;
  await fetch(`${url}/chat/sendPresence/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: to, presence, delay: delayMs }),
  }).catch(() => {}); // no es crítico
}

/** ¿Está permitido este número para consultar el vault? (allowlist) */
export function isAllowed(number: string): boolean {
  const allowed = env.whatsappAllowedNumbers;
  if (allowed.length === 0) return true; // vacío = todos (no recomendado en prod)
  const normalized = number.replace(/\D/g, "");
  return allowed.some((a) => normalized.endsWith(a) || a.endsWith(normalized));
}
