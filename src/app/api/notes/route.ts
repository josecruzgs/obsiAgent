// GET    /api/notes        -> lista de notas visibles (empresarial + personal)
// GET    /api/notes?id=xxx  -> detalle (si el usuario puede verla)
// PUT    /api/notes?id=xxx  -> edita y reindexa (en su ámbito)
// DELETE /api/notes?id=xxx  -> borra (archivo + DB)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { readNote, writeNote, deleteNote } from "@/lib/vault";
import { indexNote } from "@/lib/indexer";
import { rebuildMoc } from "@/lib/moc";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { readableNotesFilter, scopeSubdir, type Scope } from "@/lib/scope";
import type { User } from "@/lib/tenancy";
import type { NoteRecord } from "@/lib/types";

export const runtime = "nodejs";

interface ScopedRow {
  company_id: string;
  owner_user_id: string | null;
}

/** Devuelve el ámbito de una nota si el usuario puede verla; null si no existe/permiso. */
async function noteScopeForUser(
  id: string,
  user: User
): Promise<Scope | null> {
  const [row] = await query<ScopedRow>(
    `select company_id, owner_user_id from notes where id = $1`,
    [id]
  );
  if (!row) return null;
  const visible =
    row.company_id === user.company_id &&
    (row.owner_user_id === null || row.owner_user_id === user.id);
  if (!visible) return null;
  return { companyId: row.company_id, userId: row.owner_user_id };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");

    if (id) {
      const scope = await noteScopeForUser(id, user);
      if (!scope) {
        return NextResponse.json({ ok: false, error: "No encontrada" }, { status: 404 });
      }
      const note = await readNote(id, scopeSubdir(scope));
      if (note) return NextResponse.json({ ok: true, note });

      // Respaldo desde la DB si no está el .md en disco.
      const [row] = await query<NoteRecord>(
        `select id, title, summary, tags, content from notes where id = $1`,
        [id]
      );
      if (row) {
        return NextResponse.json({
          ok: true,
          fromDb: true,
          note: {
            id: row.id,
            path: `${row.id}.md`,
            frontmatter: {
              title: row.title ?? row.id,
              summary: row.summary ?? "",
              tags: row.tags ?? [],
            },
            body: row.content ?? "",
          },
        });
      }
      return NextResponse.json({ ok: false, error: "No encontrada" }, { status: 404 });
    }

    // Listado: filtra por ámbito visible + búsqueda + paginación.
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20, 1),
      100
    );
    const offset = Math.max(
      parseInt(req.nextUrl.searchParams.get("offset") || "0", 10) || 0,
      0
    );

    const f = readableNotesFilter(user, 1);
    const params: unknown[] = [...f.params];
    let where = `where ${f.sql}`;
    if (q) {
      const p = params.length + 1;
      where += ` and (title ilike $${p} or summary ilike $${p} or array_to_string(tags, ' ') ilike $${p})`;
      params.push(`%${q}%`);
    }

    const totalRows = await query<{ c: number }>(
      `select count(*)::int as c from notes ${where}`,
      params
    );
    const total = totalRows[0]?.c ?? 0;

    const rows = await query<NoteRecord>(
      `select id, title, summary, tags, updated_at
       from notes ${where}
       order by updated_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );

    return NextResponse.json({ ok: true, notes: rows, total, limit, offset });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
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
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });

    const scope = await noteScopeForUser(id, user);
    if (!scope) return NextResponse.json({ ok: false, error: "No encontrada" }, { status: 404 });

    const subdir = scopeSubdir(scope);
    const { title, summary, tags, body } = updateSchema.parse(await req.json());
    const existing = await readNote(id, subdir);

    await writeNote({
      id,
      subdir,
      frontmatter: {
        title,
        summary: summary || undefined,
        tags,
        created: existing?.frontmatter.created ?? new Date().toISOString(),
      },
      body,
    });

    const note = await readNote(id, subdir);
    if (note) await indexNote(note, scope);
    await rebuildMoc(scope).catch((e) => console.error("[notes] rebuildMoc:", e));

    return NextResponse.json({ ok: true, id, title });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });

    const scope = await noteScopeForUser(id, user);
    if (!scope) return NextResponse.json({ ok: false, error: "No encontrada" }, { status: 404 });

    const existedFile = await deleteNote(id, scopeSubdir(scope));
    await query(`delete from links where source = $1 or target = $1`, [id]);
    await query(`delete from notes where id = $1`, [id]);
    await rebuildMoc(scope).catch((e) => console.error("[notes] rebuildMoc:", e));

    return NextResponse.json({ ok: true, id, archivo_borrado: existedFile });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
