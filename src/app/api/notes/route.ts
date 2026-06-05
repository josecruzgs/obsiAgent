// GET /api/notes        -> lista de notas (id, title, tags, summary)
// GET /api/notes?id=xxx  -> detalle de una nota (incluye cuerpo del .md)
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { readNote } from "@/lib/vault";
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
