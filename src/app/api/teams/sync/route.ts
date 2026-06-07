// POST /api/teams/sync — trae las transcripciones nuevas de Teams a la base
// empresarial. Token de importación (cron) o sesión de superadmin (botón UI).
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { runTeamsSync } from "@/lib/teamsSync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const byToken = isImportAuthorized(req);
  const bySession = !byToken && (await getCurrentUser())?.role === "superadmin";
  if (!byToken && !bySession) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const r = await runTeamsSync();
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[teams] sync error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
