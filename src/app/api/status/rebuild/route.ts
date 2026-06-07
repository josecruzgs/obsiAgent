// POST /api/status/rebuild — reconstruye las notas de ESTADO por cliente.
//  - Token de importación (cron): ámbito empresarial de la empresa por defecto.
//  - Sesión superadmin: ámbito empresarial de su empresa.
// Body opcional: { clients: ["Tomalab", "North Tech", ...] }. Si se omite, se
// descubren por heurística (notas de cliente/proyecto).
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";
import { rebuildAllStatus } from "@/lib/status";

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

  let clients: string[] | undefined;
  try {
    const body = (await req.json()) as { clients?: unknown };
    if (Array.isArray(body?.clients)) {
      clients = body.clients.map((c) => String(c).trim()).filter(Boolean);
    }
  } catch {
    /* sin body: se descubren los clientes */
  }

  const company = await getBootstrapCompany();
  const scope = companyScope(company.id);

  try {
    const r = await rebuildAllStatus(scope, clients);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
