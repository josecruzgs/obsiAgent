// POST /api/onedrive/sync — sincroniza OneDrive -> vault.
//  - Con token de importación (cron): sincroniza TODAS las conexiones conectadas.
//  - Con sesión (botón en la UI): sincroniza el ámbito pedido (?scope=company|personal).
//    'company' requiere superadmin; 'personal' es la del usuario.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import {
  getConnection,
  listConnectedConnections,
  connKey,
} from "@/lib/connections";
import { runSync, runSharePointSync } from "@/lib/onedriveSync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // ── Cron: sincroniza todas las conexiones ───────────────────────────────
  if (isImportAuthorized(req)) {
    const conns = await listConnectedConnections();
    const resultados = [];
    for (const conn of conns) {
      try {
        const r = await runSync(conn);
        resultados.push({ scope: conn.target, ...r });
      } catch (err) {
        resultados.push({
          scope: conn.target,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // SharePoint adjunto a la conexión de trabajo (si está configurado).
      if (conn.target === "company" && conn.sharepoint?.siteUrl) {
        try {
          const r = await runSharePointSync(conn);
          resultados.push({ scope: "sharepoint", ...r });
        } catch (err) {
          resultados.push({
            scope: "sharepoint",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return NextResponse.json({ ok: true, conexiones: conns.length, resultados });
  }

  // ── UI: sincroniza el ámbito del usuario ────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const kind =
    new URL(req.url).searchParams.get("scope") === "company"
      ? "company"
      : "personal";
  if (kind === "company" && user.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Solo el superadmin sincroniza la carpeta empresarial." },
      { status: 403 }
    );
  }

  const conn = await getConnection(connKey(user.company_id, user.id, kind));
  if (!conn?.refresh_token) {
    return NextResponse.json(
      { ok: false, error: "OneDrive no está conectado en esta cuenta." },
      { status: 400 }
    );
  }

  try {
    const r = await runSync(conn);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
