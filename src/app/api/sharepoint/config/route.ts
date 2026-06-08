// POST /api/sharepoint/config — guarda (o quita) la biblioteca de SharePoint a
// ingerir. Reusa la cuenta de trabajo de la conexión EMPRESARIAL. Solo superadmin.
// Valida la URL resolviéndola en Microsoft Graph (requiere Sites.Read.All consentido).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { getConnection, upsertConnection, getAccessToken } from "@/lib/connections";
import { resolveSharePointDrive } from "@/lib/onedrive";
import { companyScope } from "@/lib/scope";

export const runtime = "nodejs";

const bodySchema = z.object({
  siteUrl: z.string().trim().max(400),
  folder: z.string().trim().max(200).optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.role !== "superadmin") {
      return NextResponse.json(
        { ok: false, error: "Solo el superadmin configura SharePoint." },
        { status: 403 }
      );
    }

    const { siteUrl, folder } = bodySchema.parse(await req.json());
    const scope = companyScope(user.company_id);

    // Quitar SharePoint (URL vacía).
    if (!siteUrl) {
      await upsertConnection(scope, { sharepoint: null });
      return NextResponse.json({ ok: true, configured: false });
    }

    const conn = await getConnection(scope);
    if (!conn?.refresh_token) {
      return NextResponse.json(
        { ok: false, error: "Conecta primero el OneDrive empresarial (misma cuenta de trabajo)." },
        { status: 400 }
      );
    }

    // Valida la URL: pide un token de la cuenta de trabajo y resuelve el sitio.
    const token = await getAccessToken(scope);
    const drive = await resolveSharePointDrive(token, siteUrl);

    const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
    await upsertConnection(scope, {
      sharepoint: {
        siteUrl: siteUrl.replace(/\/+$/, ""),
        folder: cleanFolder,
        siteName: drive.siteName,
        lastSync: conn.sharepoint?.lastSync ?? null,
      },
    });

    return NextResponse.json({ ok: true, configured: true, siteName: drive.siteName });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}
