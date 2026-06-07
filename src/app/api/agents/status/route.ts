// GET /api/agents/status — estado en vivo de los agentes (para la página /agentes).
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { snapshot } from "@/lib/agent/activity";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, now: Date.now(), agents: snapshot() });
}
