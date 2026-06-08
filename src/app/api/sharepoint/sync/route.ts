// POST /api/sharepoint/sync — sincroniza la biblioteca de SharePoint configurada
// hacia el ámbito EMPRESARIAL. Solo superadmin (la conexión es de la empresa).
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getConnection } from "@/lib/connections";
import { companyScope } from "@/lib/scope";
import { runSharePointSync } from "@/lib/onedriveSync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  if (user.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Solo el superadmin sincroniza SharePoint." },
      { status: 403 }
    );
  }

  const conn = await getConnection(companyScope(user.company_id));
  if (!conn?.refresh_token) {
    return NextResponse.json(
      { ok: false, error: "El OneDrive empresarial no está conectado." },
      { status: 400 }
    );
  }
  if (!conn.sharepoint?.siteUrl) {
    return NextResponse.json(
      { ok: false, error: "SharePoint no está configurado." },
      { status: 400 }
    );
  }

  try {
    const r = await runSharePointSync(conn);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
