// POST /api/curator/run — curador del grafo (near-dupes + enriquecer enlaces).
// Token de importación (cron) o superadmin. ?apply=1 para escribir los enlaces.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";
import { curateGraph } from "@/lib/curator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isImportAuthorized(req)) {
    const user = await getCurrentUser();
    if (!user || user.role !== "superadmin") {
      return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
    }
  }
  const apply = new URL(req.url).searchParams.get("apply") === "1";
  const company = await getBootstrapCompany();
  try {
    const r = await curateGraph(companyScope(company.id), { apply });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
