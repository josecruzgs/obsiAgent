// POST /api/upload — recibe archivos subidos desde la web (multipart/form-data),
// extrae su texto (.pdf/.docx/.txt/.md), los digiere con Claude, los guarda como
// .md en el vault y los indexa. Devuelve un resultado por archivo.
import { NextRequest, NextResponse } from "next/server";
import { extractTextFromBuffer, isSupported } from "@/lib/extract";
import { digestDocument } from "@/lib/claude";
import {
  listNoteTitles,
  listNoteIds,
  slugify,
  writeNote,
  readNote,
} from "@/lib/vault";
import { indexNote } from "@/lib/indexer";

export const runtime = "nodejs";

function uniqueId(base: string, taken: Set<string>): string {
  let id = base || "nota";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

export async function POST(req: NextRequest) {
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

  // Títulos/ids actuales para sugerir enlaces y evitar colisiones de nombre.
  const titles = await listNoteTitles();
  const taken = new Set(await listNoteIds());

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
      const digest = await digestDocument(text, titles, hint);
      const id = uniqueId(slugify(digest.title), taken);

      await writeNote({
        id,
        frontmatter: {
          title: digest.title,
          summary: digest.summary,
          tags: digest.tags,
          created: new Date().toISOString(),
          source: file.name,
        },
        body: text,
        links: digest.suggestedLinks,
      });

      const note = await readNote(id);
      if (note) await indexNote(note);

      titles.push(digest.title); // permite enlazar entre archivos del mismo lote
      resultados.push({ archivo: file.name, ok: true, id, titulo: digest.title });
      console.log(`[upload] OK ${file.name} -> ${id}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      resultados.push({ archivo: file.name, ok: false, error });
      console.error(`[upload] ERROR ${file.name}: ${error}`);
    }
  }

  return NextResponse.json({
    ok: true,
    total: files.length,
    procesados: resultados.filter((r) => r.ok).length,
    resultados,
  });
}
