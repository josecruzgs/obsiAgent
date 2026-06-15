// GET  /api/onedrive/status — estado de las conexiones del usuario (empresarial + personal).
// POST /api/onedrive/status — actualiza la carpeta de un ámbito { scope, folder }.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { getConnection, upsertConnection, connKey } from "@/lib/connections";
import type { OneDriveConnection } from "@/lib/connections";

export const runtime = "nodejs";

function summary(conn: OneDriveConnection | null) {
  return {
    connected: Boolean(conn?.refresh_token),
    account: conn?.account ?? "",
    folder: conn?.folder ?? "ObsiAgent",
    lastSync: conn?.last_sync ?? null,
  };
}

// Estado de SharePoint (adjunto a la conexión empresarial / cuenta de trabajo).
function sharepointSummary(company: OneDriveConnection | null) {
  const sp = company?.sharepoint ?? null;
  return {
    available: Boolean(company?.refresh_token), // hay cuenta de trabajo conectada
    configured: Boolean(sp?.siteUrl),
    siteUrl: sp?.siteUrl ?? "",
    siteName: sp?.siteName ?? "",
    folder: sp?.folder ?? "",
    lastSync: sp?.lastSync ?? null,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const [company, personal] = await Promise.all([
      getConnection(connKey(user.company_id, user.id, "company")),
      getConnection(connKey(user.company_id, user.id, "personal")),
    ]);
    return NextResponse.json({
      isSuperadmin: user.role === "superadmin",
      company: summary(company),
      personal: summary(personal),
      sharepoint: sharepointSummary(company),
    });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      NextResponse.json({ error: String(err) }, { status: 500 })
    );
  }
}

const bodySchema = z.object({
  scope: z.enum(["company", "personal"]),
  folder: z.string().trim().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { scope: kind, folder } = bodySchema.parse(await req.json());
    if (kind === "company" && user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Solo el superadmin configura la carpeta empresarial." },
        { status: 403 }
      );
    }
    const clean = folder.replace(/^\/+|\/+$/g, "");
    const conn = await upsertConnection(
      connKey(user.company_id, user.id, kind),
      { folder: clean }
    );
    return NextResponse.json({ ok: true, folder: conn.folder });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}
