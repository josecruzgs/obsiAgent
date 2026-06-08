// POST /api/voice/webcall — crea una "web call" en Retell con tu agente y
// devuelve el access_token para que el navegador inicie la llamada (sin número).
// Requiere sesión (se llama desde la UI) + RETELL_API_KEY y RETELL_AGENT_ID.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const { apiKey, agentId } = env.retell;
  if (!apiKey || !agentId) {
    return NextResponse.json(
      { ok: false, error: "Falta RETELL_API_KEY o RETELL_AGENT_ID en el servidor." },
      { status: 500 }
    );
  }

  const res = await fetch("https://api.retellai.com/v2/create-web-call", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Retell ${res.status}: ${(await res.text()).slice(0, 200)}` },
      { status: 502 }
    );
  }
  const j = (await res.json()) as { access_token?: string; call_id?: string };
  if (!j.access_token) {
    return NextResponse.json({ ok: false, error: "Retell no devolvió access_token." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, accessToken: j.access_token, callId: j.call_id });
}
