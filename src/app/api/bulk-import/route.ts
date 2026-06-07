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
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";
import { loadIngestContext, ingestText } from "@/lib/ingest";
import { rebuildMoc } from "@/lib/moc";
import { query } from "@/lib/db";

// Clave de idempotencia por nombre de archivo (evita re-ingerir el mismo
// documento si reaparece en el inbox; antes esto generaba cientos de duplicados).
const fileExtId = (name: string) => `file:${name}`;

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
      // Saltar carpetas de respaldo (locales _procesados/_fallidos y las que el
      // pipeline rclone re-baja sin guion bajo) y ocultas.
      if (
        e.name.startsWith("_") ||
        e.name.startsWith(".") ||
        e.name === "procesados" ||
        e.name === "fallidos"
      )
        continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && isSupported(e.name)) out.push(full);
    }
  }
  await walk(dir);
  return out.sort();
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

  // Sin sesión: el inbox alimenta la base EMPRESARIAL de la empresa por defecto.
  const company = await getBootstrapCompany();
  const scope = companyScope(company.id);
  const ctx = await loadIngestContext(scope);

  // Idempotencia: nombres de archivo ya ingeridos (external_id "file:<name>").
  const seen = new Set(
    (
      await query<{ external_id: string }>(
        `select external_id from notes where external_id is not null`
      )
    ).map((r) => r.external_id)
  );

  const processedDir = path.join(inbox, "_procesados");
  const failedDir = path.join(inbox, "_fallidos");
  await fs.mkdir(processedDir, { recursive: true });
  await fs.mkdir(failedDir, { recursive: true });

  const moveTo = async (file: string, dir: string): Promise<void> => {
    await fs
      .rename(file, path.join(dir, path.basename(file)))
      .catch((e) => console.error(`[bulk-import] no se pudo mover ${file}:`, e));
  };

  const procesados: { archivo: string; id: string; titulo: string }[] = [];
  const errores: { archivo: string; error: string }[] = [];
  let omitidos = 0;

  for (const file of toProcess) {
    const rel = path.relative(inbox, file);
    const base = path.basename(file);
    const extId = fileExtId(base);

    // Ya ingerido antes: no re-procesar; solo apartar el original.
    if (seen.has(extId)) {
      omitidos++;
      await moveTo(file, processedDir);
      continue;
    }

    try {
      const text = await extractText(file);
      if (!text) throw new Error("Texto vacío tras la extracción");

      const hint = path.basename(file, path.extname(file));
      const r = await ingestText(text, hint, ctx, { source: rel });

      await query(`update notes set external_id = $1 where id = $2`, [extId, r.id]).catch(
        (e) => console.error("[bulk-import] external_id:", e)
      );
      seen.add(extId);

      procesados.push({ archivo: rel, id: r.id, titulo: r.title });
      console.log(`[bulk-import] OK ${rel} -> ${r.id}`);
      await moveTo(file, processedDir);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errores.push({ archivo: rel, error });
      console.error(`[bulk-import] ERROR ${rel}: ${error}`);
      await moveTo(file, failedDir);
    }
  }

  await rebuildMoc(scope).catch((e) => console.error("[bulk-import] rebuildMoc:", e));

  return NextResponse.json({
    ok: true,
    inbox,
    encontrados: files.length,
    procesados: procesados.length,
    omitidos,
    fallidos: errores.length,
    restantes: files.length - toProcess.length,
    detalle: { procesados, errores },
  });
}
