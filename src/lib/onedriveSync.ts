// Sincroniza una fuente de Microsoft (OneDrive del usuario o una biblioteca de
// SharePoint) hacia su ámbito: lista la carpeta, descarga cada archivo, lo digiere
// (extrae texto -> Claude -> .md -> indexa) y, en OneDrive, mueve el original a
// procesados/ o fallidos/. SharePoint es solo lectura: no mueve nada y deduplica
// por external_id.
import {
  listFolderFiles,
  downloadFile,
  ensureFolder,
  moveItem,
  resolveSharePointDrive,
} from "./onedrive";
import {
  getAccessToken,
  upsertConnection,
  scopeOfConnection,
  type OneDriveConnection,
} from "./connections";
import { extractTextFromBuffer } from "./extract";
import { loadIngestContext, ingestText } from "./ingest";
import { rebuildMoc } from "./moc";
import { query } from "./db";
import { recordStart, recordEnd } from "./agent/activity";
import type { Scope } from "./scope";

// Misma clave de idempotencia que bulk-import (dedup por nombre de archivo).
const fileExtId = (name: string) => `file:${name}`;

export interface SyncResult {
  encontrados: number;
  procesados: number;
  fallidos: number;
  detalle: {
    procesados: { archivo: string; id: string; titulo: string }[];
    errores: { archivo: string; error: string }[];
  };
}

const EMPTY: SyncResult = {
  encontrados: 0,
  procesados: 0,
  fallidos: 0,
  detalle: { procesados: [], errores: [] },
};

interface IngestOpts {
  scope: Scope;
  driveBase: string; // "/me/drive" o "/drives/{id}" (SharePoint)
  folder: string; // ruta dentro del drive ("" = raíz)
  extIdPrefix: string; // "file:" (OneDrive) | "sp:" (SharePoint)
  sourceLabel: string; // etiqueta para el campo `source` de la nota
  moveProcessed: boolean; // OneDrive mueve a procesados/fallidos; SharePoint no
}

// Núcleo de ingesta de una carpeta de un drive (compartido por OneDrive y SharePoint).
async function ingestFolder(token: string, opts: IngestOpts): Promise<SyncResult> {
  const { scope, driveBase, folder, extIdPrefix, sourceLabel, moveProcessed } = opts;

  const files = await listFolderFiles(token, folder, driveBase);
  if (files.length === 0) return EMPTY;

  let procDir = "";
  let failDir = "";
  if (moveProcessed) {
    procDir = await ensureFolder(token, folder, "procesados", driveBase);
    failDir = await ensureFolder(token, folder, "fallidos", driveBase);
  }

  const seen = new Set(
    (
      await query<{ external_id: string }>(
        `select external_id from notes where external_id is not null`
      )
    ).map((r) => r.external_id)
  );

  const ctx = await loadIngestContext(scope);
  const procesados: SyncResult["detalle"]["procesados"] = [];
  const errores: SyncResult["detalle"]["errores"] = [];

  for (const f of files) {
    try {
      const extId = extIdPrefix + f.name;
      if (seen.has(extId)) {
        // Ya ingerido: en OneDrive se aparta el original; en SharePoint se ignora.
        if (moveProcessed) await moveItem(token, f.id, procDir, driveBase).catch(() => {});
        continue;
      }

      const buf = await downloadFile(token, f.id, driveBase);
      const text = await extractTextFromBuffer(f.name, buf);
      if (!text) throw new Error("Texto vacío tras la extracción");

      const hint = f.name.replace(/\.[^.]+$/, "");
      const r = await ingestText(text, hint, ctx, {
        source: `${sourceLabel}:${folder}/${f.name}`,
      });
      await query(`update notes set external_id = $1 where id = $2`, [extId, r.id]).catch(
        (e) => console.error("[sync] external_id:", e)
      );
      seen.add(extId);
      if (moveProcessed) await moveItem(token, f.id, procDir, driveBase);
      procesados.push({ archivo: f.name, id: r.id, titulo: r.title });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errores.push({ archivo: f.name, error });
      if (moveProcessed) await moveItem(token, f.id, failDir, driveBase).catch(() => {});
    }
  }

  return {
    encontrados: files.length,
    procesados: procesados.length,
    fallidos: errores.length,
    detalle: { procesados, errores },
  };
}

// ─── OneDrive (drive del usuario) ──────────────────────────────────────────
export async function runSync(conn: OneDriveConnection): Promise<SyncResult> {
  const scope = scopeOfConnection(conn);
  recordStart("onedrive");
  const ingeridos: string[] = [];
  try {
    // Si el refresh token ya no sirve (p. ej. AADSTS50076: requiere MFA), guardamos
    // el error en last_sync para que /config muestre "reconecta", y relanzamos.
    let token: string;
    try {
      token = await getAccessToken(scope);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await upsertConnection(scope, {
        last_sync: { at: new Date().toISOString(), ok: 0, failed: 0, error },
      }).catch(() => {});
      throw err;
    }

    const res = await ingestFolder(token, {
      scope,
      driveBase: "/me/drive",
      folder: conn.folder,
      extIdPrefix: "file:",
      sourceLabel: "onedrive",
      moveProcessed: true,
    });
    ingeridos.push(...res.detalle.procesados.map((p) => p.archivo));

    await rebuildMoc(scope).catch((e) => console.error("[onedrive] rebuildMoc:", e));
    await upsertConnection(scope, {
      last_sync: {
        at: new Date().toISOString(),
        ok: res.procesados,
        failed: res.fallidos,
      },
    });
    return res;
  } finally {
    recordEnd("onedrive", ingeridos);
  }
}

// ─── SharePoint (biblioteca de un sitio, adjunta a la conexión empresarial) ──
export async function runSharePointSync(conn: OneDriveConnection): Promise<SyncResult> {
  const sp = conn.sharepoint;
  if (!sp?.siteUrl) throw new Error("SharePoint no está configurado.");
  const scope = scopeOfConnection(conn); // empresarial
  recordStart("sharepoint");
  const ingeridos: string[] = [];
  try {
    const token = await getAccessToken(scope);
    const drive = await resolveSharePointDrive(token, sp.siteUrl);

    const res = await ingestFolder(token, {
      scope,
      driveBase: `/drives/${drive.driveId}`,
      folder: sp.folder || "",
      extIdPrefix: "sp:",
      sourceLabel: "sharepoint",
      moveProcessed: false,
    });
    ingeridos.push(...res.detalle.procesados.map((p) => p.archivo));

    await rebuildMoc(scope).catch((e) => console.error("[sharepoint] rebuildMoc:", e));
    await upsertConnection(scope, {
      sharepoint: {
        ...sp,
        siteName: drive.siteName,
        lastSync: {
          at: new Date().toISOString(),
          ok: res.procesados,
          failed: res.fallidos,
        },
      },
    });
    return res;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await upsertConnection(scope, {
      sharepoint: { ...sp, lastSync: { at: new Date().toISOString(), ok: 0, failed: 0, error } },
    }).catch(() => {});
    throw err;
  } finally {
    recordEnd("sharepoint", ingeridos);
  }
}
