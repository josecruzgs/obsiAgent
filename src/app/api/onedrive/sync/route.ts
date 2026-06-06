// POST /api/onedrive/sync — descarga los archivos nuevos de la carpeta de
// OneDrive, los digiere (extrae texto -> Claude -> .md -> indexa) y mueve cada
// original a la subcarpeta procesados/ o fallidos/ dentro de OneDrive.
//
// Reemplaza al script rclone+cron: ya no hace falta el inbox local. Lo puede
// disparar el botón "Sincronizar ahora" de /config o un cron pegándole aquí.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getCurrentUser } from "@/lib/currentUser";
import { getOneDrive, setOneDrive } from "@/lib/settings";
import {
  getAccessToken,
  listFolderFiles,
  downloadFile,
  ensureFolder,
  moveItem,
} from "@/lib/onedrive";
import { extractTextFromBuffer } from "@/lib/extract";
import { loadIngestContext, ingestText } from "@/lib/ingest";
import { rebuildMoc } from "@/lib/moc";

export const runtime = "nodejs";
export const maxDuration = 300; // lotes grandes pueden tardar (Claude por archivo)

export async function POST(req: NextRequest) {
  // Acceso: token de importación (cron) o sesión de usuario (botón en la UI).
  const authorized = isImportAuthorized(req) || (await getCurrentUser()) !== null;
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const s = await getOneDrive();
    if (!s.refreshToken) {
      return NextResponse.json(
        { ok: false, error: "OneDrive no está conectado." },
        { status: 400 }
      );
    }

    const token = await getAccessToken();
    const files = await listFolderFiles(token, s.folder);

    if (files.length === 0) {
      const at = new Date().toISOString();
      await setOneDrive({ lastSync: { at, ok: 0, failed: 0 } });
      return NextResponse.json({
        ok: true,
        encontrados: 0,
        procesados: 0,
        fallidos: 0,
        detalle: { procesados: [], errores: [] },
      });
    }

    // Carpetas de respaldo dentro de OneDrive (se crean si no existen).
    const procDir = await ensureFolder(token, s.folder, "procesados");
    const failDir = await ensureFolder(token, s.folder, "fallidos");

    const ctx = await loadIngestContext();
    const procesados: { archivo: string; id: string; titulo: string }[] = [];
    const errores: { archivo: string; error: string }[] = [];

    for (const f of files) {
      try {
        const buf = await downloadFile(token, f.id);
        const text = await extractTextFromBuffer(f.name, buf);
        if (!text) throw new Error("Texto vacío tras la extracción");

        const hint = f.name.replace(/\.[^.]+$/, "");
        const r = await ingestText(text, hint, ctx, {
          source: `onedrive:${s.folder}/${f.name}`,
        });
        await moveItem(token, f.id, procDir);
        procesados.push({ archivo: f.name, id: r.id, titulo: r.title });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errores.push({ archivo: f.name, error });
        await moveItem(token, f.id, failDir).catch(() => {});
      }
    }

    await rebuildMoc().catch((e) => console.error("[onedrive] rebuildMoc:", e));

    const at = new Date().toISOString();
    await setOneDrive({
      lastSync: { at, ok: procesados.length, failed: errores.length },
    });

    return NextResponse.json({
      ok: true,
      encontrados: files.length,
      procesados: procesados.length,
      fallidos: errores.length,
      detalle: { procesados, errores },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[onedrive] sync error:", msg);
    await setOneDrive({
      lastSync: { at: new Date().toISOString(), ok: 0, failed: 0, error: msg },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
