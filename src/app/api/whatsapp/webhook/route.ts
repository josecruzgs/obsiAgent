// POST /api/whatsapp/webhook — recibe eventos de Evolution API (MESSAGES_UPSERT),
// ejecuta RAG sobre el vault y responde por WhatsApp.
//
// Configura en Evolution el webhook hacia esta URL con el evento MESSAGES_UPSERT.
import { NextRequest, NextResponse } from "next/server";
import { runAssistant } from "@/lib/agents/assistant";
import { getBootstrapCompany, getBootstrapOwner, type User } from "@/lib/tenancy";
import {
  sendText,
  sendAudio,
  sendPresence,
  getMediaBase64,
  isAllowed,
  resolvePhoneJid,
} from "@/lib/evolution";
import { transcribeAudio, synthesizeSpeech } from "@/lib/audio";
import { env } from "@/lib/env";

// Petición explícita de hablar por llamada de voz (no nota de voz).
const CALL_REQUEST = /(ll[aá]mame|ll[aá]mar|llamada de voz|hablar por voz|quiero (una )?llamada)/i;

// uuid imposible: hace que el filtro "personal" no devuelva nada -> solo empresarial.
const NO_USER = "00000000-0000-0000-0000-000000000000";

export const runtime = "nodejs";

interface EvolutionMessage {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: { mimetype?: string };
  };
  pushName?: string;
}

interface EvolutionWebhook {
  event?: string;
  instance?: string;
  data?: EvolutionMessage | EvolutionMessage[];
}

function extractText(msg: EvolutionMessage): string {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ""
  ).trim();
}

export async function POST(req: NextRequest) {
  let payload: EvolutionWebhook;
  try {
    payload = (await req.json()) as EvolutionWebhook;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Solo nos interesan mensajes entrantes nuevos.
  const event = (payload.event || "").toLowerCase();
  if (event && !event.includes("messages")) {
    return NextResponse.json({ ok: true, ignored: "event" });
  }

  const items = Array.isArray(payload.data)
    ? payload.data
    : payload.data
    ? [payload.data]
    : [];

  // Procesa cada mensaje de forma asíncrona; responde 200 rápido al webhook.
  for (const msg of items) {
    void processMessage(msg).catch((e) =>
      console.error("[whatsapp] processMessage error:", e)
    );
  }

  return NextResponse.json({ ok: true });
}

async function processMessage(msg: EvolutionMessage): Promise<void> {
  const jid = msg.key?.remoteJid ?? "";
  const fromMe = msg.key?.fromMe ?? false;
  const hasAudio = Boolean(msg.message?.audioMessage);
  let text = extractText(msg);

  // Ignora: mensajes propios, grupos, y los que no son ni texto ni audio.
  if (fromMe || jid.endsWith("@g.us") || !jid || (!text && !hasAudio)) return;

  // Resolver LID -> teléfono real (para filtrar y responder).
  let phoneJid: string | null = jid;
  if (jid.endsWith("@lid")) {
    phoneJid = await resolvePhoneJid(jid);
    if (!phoneJid) {
      console.warn(`[whatsapp] no se pudo resolver el LID ${jid}; se ignora.`);
      return;
    }
  }
  const phone = phoneJid.split("@")[0];
  const targets = [phoneJid]; // Evolution no envía a @lid; respondemos al teléfono.

  if (!isAllowed(phone)) {
    console.log(`[whatsapp] número no autorizado: ${phone}`);
    void sendToFirst(
      targets,
      "Lo siento, este número no está autorizado para consultar el vault."
    );
    return;
  }

  // Indicador: "grabando audio…" si va a responder con voz; si no, "escribiendo…".
  void sendPresence(targets[0], hasAudio ? "recording" : "composing");

  // Nota de voz: descargar, transcribir, y marcar para responder con audio.
  let wasAudio = false;
  if (!text && hasAudio) {
    try {
      const media = await getMediaBase64(msg.key);
      if (!media?.base64) throw new Error("no se pudo bajar el audio");
      text = await transcribeAudio(Buffer.from(media.base64, "base64"), media.mimetype);
      wasAudio = true;
    } catch (e) {
      console.error("[whatsapp] STT error:", e);
      await sendToFirst(targets, "No pude entender el audio 😕 ¿me lo escribes?");
      return;
    }
    if (!text) {
      await sendToFirst(targets, "El audio llegó vacío. ¿Me lo escribes?");
      return;
    }
    console.log(`[whatsapp] audio transcrito: ${text.slice(0, 80)}`);
  }

  // Si pide hablar por LLAMADA de voz, mandamos el enlace a la web call.
  if (CALL_REQUEST.test(text)) {
    await sendToFirst(
      targets,
      `Claro 🎙️ Toca este enlace para hablar conmigo por voz:\n${env.publicBaseUrl}/voz`
    );
    return;
  }

  await handleQuery(targets, text, wasAudio).catch((e) =>
    console.error("[whatsapp] handleQuery error:", e)
  );
}

/** Intenta enviar a cada destino en orden hasta que uno funcione. */
async function sendToFirst(targets: string[], text: string): Promise<void> {
  for (const to of targets) {
    try {
      await sendText(to, text);
      console.log(`[whatsapp] enviado a ${to}`);
      return;
    } catch (e) {
      console.error(`[whatsapp] send error (${to}):`, e);
    }
  }
}

async function handleQuery(
  targets: string[],
  text: string,
  replyWithAudio = false
): Promise<void> {
  // WhatsApp busca como el "dueño" de la empresa: así el agente ve tanto la
  // base EMPRESARIAL (compartida) como las notas PERSONALES del dueño, y la
  // relevancia decide de cuál tomar la respuesta.
  const company = await getBootstrapCompany();
  const owner = await getBootstrapOwner();
  const companyUser: User = owner ?? {
    id: NO_USER,
    company_id: company.id,
    email: "",
    name: null,
    role: "member",
    ms_oid: null,
  };
  // Agente: responde con RAG agéntico y puede crear notas si se le pide.
  const result = await runAssistant(text, companyUser, { allowWrite: true });

  // Si el usuario mandó audio, responde con voz (TTS); si falla, cae a texto.
  if (replyWithAudio) {
    try {
      const audio = await synthesizeSpeech(result.answer);
      await sendAudioToFirst(targets, audio.toString("base64"));
      return;
    } catch (e) {
      console.error("[whatsapp] TTS error (cae a texto):", e);
    }
  }
  await sendToFirst(targets, result.answer);
}

/** Envía una nota de voz al primer destino que funcione. */
async function sendAudioToFirst(targets: string[], base64Audio: string): Promise<void> {
  for (const to of targets) {
    try {
      await sendAudio(to, base64Audio);
      console.log(`[whatsapp] audio enviado a ${to}`);
      return;
    } catch (e) {
      console.error(`[whatsapp] sendAudio error (${to}):`, e);
    }
  }
}
