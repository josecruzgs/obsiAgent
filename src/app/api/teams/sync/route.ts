// POST /api/teams/sync — trae transcripciones de Teams.
//  - Token de importación (cron): sincroniza TODAS las conexiones elegibles
//    (cuentas de trabajo), cada una hacia su ámbito (personal/empresarial).
//  - Sesión: sincroniza el ámbito pedido (?scope=company|personal) del usuario.
//    'company' requiere superadmin.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { listConnectedConnections } from "@/lib/connections";
import { companyScope, personalScope } from "@/lib/scope";
import {
  runTeamsSyncForConnection,
  runTeamsSyncForScope,
  teamsEligible,
} from "@/lib/teamsSync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // ── Cron: todas las conexiones elegibles ────────────────────────────────
  if (isImportAuthorized(req)) {
    const conns = (await listConnectedConnections()).filter(teamsEligible);
    const resultados = [];
    for (const conn of conns) {
      const ambito = conn.owner_user_id ? "personal" : "empresarial";
      try {
        const r = await runTeamsSyncForConnection(conn);
        resultados.push({ ambito, cuenta: conn.account, ...r });
      } catch (err) {
        resultados.push({
          ambito,
          cuenta: conn.account,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return NextResponse.json({ ok: true, conexiones: conns.length, resultados });
  }

  // ── Sesión: ámbito del usuario ──────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const kind =
    new URL(req.url).searchParams.get("scope") === "company" ? "company" : "personal";
  if (kind === "company" && user.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Solo el superadmin sincroniza Teams de la base empresarial." },
      { status: 403 }
    );
  }

  const scope =
    kind === "company"
      ? companyScope(user.company_id)
      : personalScope(user.company_id, user.id);

  try {
    const r = await runTeamsSyncForScope(scope);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
