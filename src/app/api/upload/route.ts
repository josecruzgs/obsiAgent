// POST /api/upload — archivos subidos desde la web (multipart/form-data): extrae
// texto, digiere con Claude y los guarda como notas EMPRESARIALES + indexa.
import { NextRequest, NextResponse } from "next/server";
import { extractTextFromBuffer, isSupported } from "@/lib/extract";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { companyScope, personalScope } from "@/lib/scope";
import { loadIngestContext, ingestText } from "@/lib/ingest";
import { rebuildMoc } from "@/lib/moc";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    return authErrorResponse(err) ?? NextResponse.json({ ok: false, error: String(err) }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo inválido (se esperaba multipart/form-data)" },
      { status: 400 }
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No se recibió ningún archivo" },
      { status: 400 }
    );
  }

  const kind = form.get("scope") === "company" ? "company" : "personal";
  if (kind === "company" && user.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Solo el superadmin puede subir a la base empresarial." },
      { status: 403 }
    );
  }
  const scope =
    kind === "company"
      ? companyScope(user.company_id)
      : personalScope(user.company_id, user.id);
  const ctx = await loadIngestContext(scope);

  const resultados: {
    archivo: string;
    ok: boolean;
    id?: string;
    titulo?: string;
    error?: string;
  }[] = [];

  for (const file of files) {
    try {
      if (!isSupported(file.name)) {
        throw new Error("Formato no soportado (usa pdf, docx, txt o md)");
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const text = await extractTextFromBuffer(file.name, buf);
      if (!text) throw new Error("No se pudo extraer texto del archivo");

      const hint = file.name.replace(/\.[^.]+$/, "");
      const r = await ingestText(text, hint, ctx, { source: file.name });
      resultados.push({ archivo: file.name, ok: true, id: r.id, titulo: r.title });
      console.log(`[upload] OK ${file.name} -> ${r.id}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      resultados.push({ archivo: file.name, ok: false, error });
      console.error(`[upload] ERROR ${file.name}: ${error}`);
    }
  }

  await rebuildMoc(scope).catch((e) => console.error("[upload] rebuildMoc:", e));

  return NextResponse.json({
    ok: true,
    total: files.length,
    procesados: resultados.filter((r) => r.ok).length,
    resultados,
  });
}
