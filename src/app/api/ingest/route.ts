// POST /api/ingest — digiere un documento raw y lo guarda como nota en el vault + DB.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { digestDocument } from "@/lib/claude";
import { listNoteTitles, slugify, writeNote, readNote } from "@/lib/vault";
import { indexNote } from "@/lib/indexer";

export const runtime = "nodejs";

const bodySchema = z.object({
  raw: z.string().min(1, "El documento no puede estar vacío"),
  title: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { raw, title } = bodySchema.parse(await req.json());

    // 1. Digestión con Claude: título, resumen, tags, enlaces sugeridos.
    const existingTitles = await listNoteTitles();
    const digest = await digestDocument(raw, existingTitles, title);

    // 2. Escribir el .md en el vault (frontmatter + cuerpo + wikilinks).
    const id = slugify(digest.title);
    const created = new Date().toISOString();
    await writeNote({
      id,
      frontmatter: {
        title: digest.title,
        summary: digest.summary,
        tags: digest.tags,
        created,
      },
      body: raw,
      links: digest.suggestedLinks,
    });

    // 3. Indexar en la DB (embedding Voyage + enlaces).
    const note = await readNote(id);
    if (note) await indexNote(note);

    return NextResponse.json({
      ok: true,
      id,
      title: digest.title,
      summary: digest.summary,
      tags: digest.tags,
      links: digest.suggestedLinks,
    });
  } catch (err) {
    console.error("[ingest] error:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
