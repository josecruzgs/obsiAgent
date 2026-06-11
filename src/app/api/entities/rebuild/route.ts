// POST /api/entities/rebuild — reconstruye PÁGINAS DE ENTIDAD/TEMA vivas (wiki
// que compone, patrón Karpathy).
//  - Token de importación (cron): ámbito empresarial de la empresa por defecto.
//  - Sesión superadmin: ámbito empresarial de su empresa.
// Query: ?tipo=tema (default) · ?limit=N (default 5, acota el costo).
// Body opcional: { names: ["Onboarding", "Facturación", ...] } para un tipo dado.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";
import { rebuildEntities } from "@/lib/entities";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authorized = isImportAuthorized(req);
  if (!authorized) {
    const user = await getCurrentUser();
    if (!user || user.role !== "superadmin") {
      return NextResponse.json(
        { ok: false, error: "Solo superadmin o token de importación." },
        { status: 403 }
      );
    }
  }

  const url = new URL(req.url);
  const tipo = (url.searchParams.get("tipo") || "tema").trim().toLowerCase();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "5", 10) || 5, 1),
    50
  );

  let names: string[] | undefined;
  try {
    const body = (await req.json()) as { names?: unknown };
    if (Array.isArray(body?.names)) {
      names = body.names.map((n) => String(n).trim()).filter(Boolean);
    }
  } catch {
    /* sin body: se descubren (si tipo = "tema") */
  }

  const company = await getBootstrapCompany();
  const scope = companyScope(company.id);

  try {
    const r = await rebuildEntities(tipo, scope, { names, limit });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
