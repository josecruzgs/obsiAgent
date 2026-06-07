// POST /api/ingest — digiere un documento raw y lo guarda como nota EMPRESARIAL.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { companyScope, personalScope } from "@/lib/scope";
import { loadIngestContext, ingestText } from "@/lib/ingest";
import { rebuildMoc } from "@/lib/moc";

export const runtime = "nodejs";

const bodySchema = z.object({
  raw: z.string().min(1, "El documento no puede estar vacío"),
  title: z.string().optional(),
  scope: z.enum(["company", "personal"]).default("personal"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { raw, title, scope: kind } = bodySchema.parse(await req.json());

    if (kind === "company" && user.role !== "superadmin") {
      return NextResponse.json(
        { ok: false, error: "Solo el superadmin puede ingerir a la base empresarial." },
        { status: 403 }
      );
    }
    const scope =
      kind === "company"
        ? companyScope(user.company_id)
        : personalScope(user.company_id, user.id);
    const ctx = await loadIngestContext(scope);
    const r = await ingestText(raw, title, ctx);

    await rebuildMoc(scope).catch((e) => console.error("[ingest] rebuildMoc:", e));

    return NextResponse.json({
      ok: true,
      id: r.id,
      title: r.title,
      summary: r.summary,
      tags: r.tags,
      links: r.links,
    });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    console.error("[ingest] error:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
