// POST /api/admin/dedupe — limpieza TEMPORAL de notas duplicadas (mismo título,
// sin external_id) generadas por el bucle del pipeline rclone+bulk-import.
// Solo superadmin. DRY-RUN por defecto; ?apply=1 para borrar de verdad.
// BORRAR este endpoint tras ejecutar la limpieza.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { dedupeNullExternalIdNotes } from "@/lib/dedupe";
import { rebuildMoc } from "@/lib/moc";
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Solo superadmin." },
      { status: 403 }
    );
  }

  const apply = new URL(req.url).searchParams.get("apply") === "1";
  const r = await dedupeNullExternalIdNotes(apply);

  if (apply) {
    // Reconstruir el índice/MOC empresarial tras borrar.
    const company = await getBootstrapCompany();
    await rebuildMoc(companyScope(company.id)).catch(() => {});
  }

  return NextResponse.json({ ok: true, ...r });
}
