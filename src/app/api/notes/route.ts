// GET    /api/notes        -> lista de notas (id, title, tags, summary)
// GET    /api/notes?id=xxx  -> detalle de una nota (incluye cuerpo del .md)
// PUT    /api/notes?id=xxx  -> edita título/summary/tags/cuerpo y reindexa
// DELETE /api/notes?id=xxx  -> borra la nota (archivo + DB)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { readNote, writeNote, deleteNote } from "@/lib/vault";
import { indexNote } from "@/lib/indexer";
import { rebuildMoc } from "@/lib/moc";
import type { NoteRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const note = await readNote(id);
    if (!note) {
      return NextResponse.json({ ok: false, error: "No encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, note });
  }

  const rows = await query<NoteRecord>(
    `select id, title, summary, tags, updated_at
     from notes order by updated_at desc limit 500`
  );
  return NextResponse.json({ ok: true, notes: rows });
}

const updateSchema = z.object({
  title: z.string().min(1, "El título no puede estar vacío"),
  summary: z.string().optional().default(""),
  tags: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((t) =>
      Array.isArray(t)
        ? t
        : (t ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    ),
  body: z.string().default(""),
});

export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });
  }
  try {
    const { title, summary, tags, body } = updateSchema.parse(await req.json());
    const existing = await readNote(id);

    // Conserva la fecha de creación; el id (nombre de archivo) no cambia.
    await writeNote({
      id,
      frontmatter: {
        title,
        summary: summary || undefined,
        tags,
        created: existing?.frontmatter.created ?? new Date().toISOString(),
      },
      body,
    });

    const note = await readNote(id);
    if (note) await indexNote(note);
    await rebuildMoc().catch((e) => console.error("[notes] rebuildMoc:", e));

    return NextResponse.json({ ok: true, id, title });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });
  }
  // Borra el archivo del vault (si existe) y limpia la DB (notas + enlaces).
  const existedFile = await deleteNote(id);
  await query(`delete from links where source = $1 or target = $1`, [id]);
  await query(`delete from notes where id = $1`, [id]);
  await rebuildMoc().catch((e) => console.error("[notes] rebuildMoc:", e));

  return NextResponse.json({ ok: true, id, archivo_borrado: existedFile });
}
