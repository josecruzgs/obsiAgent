// POST /api/whatsapp/webhook — recibe eventos de Evolution API (MESSAGES_UPSERT),
// ejecuta RAG sobre el vault y responde por WhatsApp.
//
// Configura en Evolution el webhook hacia esta URL con el evento MESSAGES_UPSERT.
import { NextRequest, NextResponse } from "next/server";
import { runAssistant } from "@/lib/agents/assistant";
import { getBootstrapCompany, type User } from "@/lib/tenancy";
import { sendText, isAllowed } from "@/lib/evolution";

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

  // Procesa de forma asíncrona; responde 200 rápido al webhook.
  for (const msg of items) {
    // DEBUG TEMPORAL: ver la forma real del mensaje entrante (jid/LID/número).
    console.log("[whatsapp] inbound:", JSON.stringify(msg).slice(0, 800));
    const jid = msg.key?.remoteJid ?? "";
    const fromMe = msg.key?.fromMe ?? false;
    const text = extractText(msg);

    // Ignora: mensajes propios, grupos, vacíos.
    if (fromMe || !text || jid.endsWith("@g.us") || !jid) continue;

    const number = jid.split("@")[0];

    if (!isAllowed(number)) {
      void sendText(
        jid,
        "Lo siento, este número no está autorizado para consultar el vault."
      ).catch((e) => console.error("[whatsapp] send error:", e));
      continue;
    }

    // Procesa RAG y responde al jid completo (maneja @lid y @s.whatsapp.net).
    void handleQuery(jid, text).catch((e) =>
      console.error("[whatsapp] handleQuery error:", e)
    );
  }

  return NextResponse.json({ ok: true });
}

async function handleQuery(to: string, text: string): Promise<void> {
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
  const result = await runAssistant(text, companyUser, { allowWrite: true });
  const sources =
    result.sources.length > 0
      ? "\n\n_Fuentes: " +
        result.sources.map((s) => s.title ?? s.id).join(", ") +
        "_"
      : "";
  await sendText(to, result.answer + sources);
}
