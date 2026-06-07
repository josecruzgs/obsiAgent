// POST /api/router/run — enrutador: clasifica notas por cliente (tag cliente/<slug>).
// Token de importación (cron) o superadmin. ?apply=1 para escribir; ?limit=N.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";
import { routeUnclassified } from "@/lib/router";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isImportAuthorized(req)) {
    const user = await getCurrentUser();
    if (!user || user.role !== "superadmin") {
      return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
    }
  }
  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const company = await getBootstrapCompany();
  try {
    const r = await routeUnclassified(companyScope(company.id), { apply, limit });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
