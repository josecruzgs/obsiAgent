// POST /api/bulk-import — importa en bloque los archivos de la bandeja (inbox):
// extrae texto (.md/.txt/.docx/.pdf) → digiere con Claude → escribe .md en el
// vault → indexa (embedding + enlaces). Mueve cada original a _procesados/_fallidos.
//
// Protegido por token (header x-import-token o ?token=, ver BULK_IMPORT_TOKEN).
// Llamar desde el VPS, p.ej.:
//   curl -X POST "http://127.0.0.1:3001/api/bulk-import?token=XXXX&limit=20"
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { isImportAuthorized } from "@/lib/importAuth";
import { extractText, isSupported } from "@/lib/extract";
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

async function listInboxFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return; // la carpeta puede no existir aún
    }
    for (const e of entries) {
      if (e.name.startsWith("_") || e.name.startsWith(".")) continue; // _procesados, etc.
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && isSupported(e.name)) out.push(full);
    }
  }
  await walk(dir);
  return out.sort();
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base || "nota";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

export async function POST(req: NextRequest) {
  if (!isImportAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado: falta o no coincide el token." },
      { status: 401 }
    );
  }

  const inbox = env.inboxPath;
  const limit = parseInt(new URL(req.url).searchParams.get("limit") || "0", 10);

  const files = await listInboxFiles(inbox);
  const toProcess = limit > 0 ? files.slice(0, limit) : files;

  // Títulos/ids actuales para sugerir enlaces y evitar colisiones de nombre.
  const titles = await listNoteTitles();
  const takenIds = new Set(await listNoteIds());

  const processedDir = path.join(inbox, "_procesados");
  const failedDir = path.join(inbox, "_fallidos");
  await fs.mkdir(processedDir, { recursive: true });
  await fs.mkdir(failedDir, { recursive: true });

  const procesados: { archivo: string; id: string; titulo: string }[] = [];
  const errores: { archivo: string; error: string }[] = [];

  for (const file of toProcess) {
    const rel = path.relative(inbox, file);
    try {
      const text = await extractText(file);
      if (!text) throw new Error("Texto vacío tras la extracción");

      const hint = path.basename(file, path.extname(file));
      const digest = await digestDocument(text, titles, hint);
      const id = uniqueId(slugify(digest.title), takenIds);

      await writeNote({
        id,
        frontmatter: {
          title: digest.title,
          summary: digest.summary,
          tags: digest.tags,
          created: new Date().toISOString(),
          source: rel,
        },
        body: text,
        links: digest.suggestedLinks,
      });

      const note = await readNote(id);
      if (note) await indexNote(note);

      titles.push(digest.title); // permite enlazar a notas creadas en este lote
      procesados.push({ archivo: rel, id, titulo: digest.title });
      console.log(`[bulk-import] OK ${rel} -> ${id}`);

      await fs
        .rename(file, path.join(processedDir, path.basename(file)))
        .catch(() => {});
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errores.push({ archivo: rel, error });
      console.error(`[bulk-import] ERROR ${rel}: ${error}`);
      await fs
        .rename(file, path.join(failedDir, path.basename(file)))
        .catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    inbox,
    encontrados: files.length,
    procesados: procesados.length,
    fallidos: errores.length,
    restantes: files.length - toProcess.length,
    detalle: { procesados, errores },
  });
}
