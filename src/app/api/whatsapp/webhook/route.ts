// POST /api/whatsapp/webhook — recibe eventos de Evolution API (MESSAGES_UPSERT),
// ejecuta RAG sobre el vault y responde por WhatsApp.
//
// Configura en Evolution el webhook hacia esta URL con el evento MESSAGES_UPSERT.
import { NextRequest, NextResponse } from "next/server";
import { runAssistant } from "@/lib/agents/assistant";
import { getBootstrapCompany, type User } from "@/lib/tenancy";
import { sendText, sendPresence, isAllowed, resolvePhoneJid } from "@/lib/evolution";

// uuid imposible: hace que el filtro "personal" no devuelva nada -> solo empresarial.
const NO_USER = "00000000-0000-0000-0000-000000000000";

export const runtime = "nodejs";

interface EvolutionMessage {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
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
  const text = extractText(msg);

  // Ignora: mensajes propios, grupos, vacíos.
  if (fromMe || !text || jid.endsWith("@g.us") || !jid) return;

  // WhatsApp puede presentar al remitente como LID (id oculto). Para FILTRAR por
  // número resolvemos su teléfono real; para RESPONDER intentamos primero la
  // identidad original (el LID), porque así la sesión de cifrado coincide en
  // todos los dispositivos del usuario (evita "esperando este mensaje"); si el
  // envío al LID falla, caemos al teléfono.
  let phoneJid: string | null = jid;
  if (jid.endsWith("@lid")) {
    phoneJid = await resolvePhoneJid(jid);
    if (!phoneJid) {
      console.warn(`[whatsapp] no se pudo resolver el LID ${jid}; se ignora.`);
      return;
    }
  }
  const phone = phoneJid.split("@")[0];

  // Destinos de respuesta, en orden de preferencia (identidad original primero).
  const targets = jid === phoneJid ? [jid] : [jid, phoneJid];

  if (!isAllowed(phone)) {
    console.log(`[whatsapp] número no autorizado: ${phone}`);
    void sendToFirst(
      targets,
      "Lo siento, este número no está autorizado para consultar el vault."
    );
    return;
  }

  // Muestra "escribiendo…" mientras el agente piensa (mejora la espera).
  void sendPresence(targets[0], "composing");

  await handleQuery(targets, text).catch((e) =>
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

async function handleQuery(targets: string[], text: string): Promise<void> {
  // WhatsApp consulta la base EMPRESARIAL de la empresa por defecto.
  const company = await getBootstrapCompany();
  const companyUser: User = {
    id: NO_USER,
    company_id: company.id,
    email: "",
    name: null,
    role: "member",
    ms_oid: null,
  };
  // Agente: responde con RAG agéntico y puede crear notas si se le pide.
  // Respuesta natural por chat: sin pie de "Fuentes" (el agente menciona el
  // origen en prosa si aporta).
  const result = await runAssistant(text, companyUser, { allowWrite: true });
  await sendToFirst(targets, result.answer);
}
