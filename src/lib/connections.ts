// Conexiones a Microsoft (OneDrive/Teams/SharePoint) persistidas en la tabla
// onedrive_connections. Cada conexión la posee el usuario que la conectó y tiene
// un `target` que decide a qué base de conocimiento alimenta:
//   - target='company'  -> cuenta de TRABAJO: notas del vault empresarial compartido
//     (owner null). Varios admins pueden tener una cada uno; todas alimentan el mismo vault.
//   - target='personal' -> OneDrive personal del usuario: su bóveda privada.
// Maneja el refresh token y su rotación.
import { query } from "./db";
import { ensureTenancy } from "./tenancy";
import { refreshAccessToken } from "./onedrive";
import { companyScope, personalScope, type Scope } from "./scope";

export type ConnTarget = "company" | "personal";

/** Identifica una conexión: a qué empresa, qué usuario la posee y qué alimenta. */
export interface ConnKey {
  companyId: string;
  ownerUserId: string;
  target: ConnTarget;
}

export interface SyncSummary {
  at: string;
  ok: number;
  failed: number;
  error?: string;
}

// Config de SharePoint adjunta a la conexión de TRABAJO (misma cuenta M365).
// Vacío/null = SharePoint no configurado.
export interface SharePointConfig {
  siteUrl: string; // https://host/sites/Equipo
  folder: string; // ruta dentro de la biblioteca ("" = raíz)
  siteName?: string; // nombre legible (cacheado al validar)
  lastSync?: SyncSummary | null;
}

export interface OneDriveConnection {
  id: string;
  company_id: string;
  owner_user_id: string; // usuario que conectó la cuenta
  target: ConnTarget; // 'company' (vault compartido) | 'personal' (bóveda privada)
  refresh_token: string | null;
  account: string | null;
  folder: string;
  last_sync: SyncSummary | null;
  tenant_id: string | null; // tid de Microsoft (para Teams app-only)
  ms_user_id: string | null; // oid/GUID del usuario (organizador de reuniones)
  teams_since: Date | null; // corte: solo grabaciones creadas después de esta marca
  sharepoint: SharePointConfig | null; // config de SharePoint (solo target='company')
}

export interface ConnectionPatch {
  refresh_token?: string | null;
  account?: string | null;
  folder?: string;
  last_sync?: SyncSummary | null;
  tenant_id?: string | null;
  ms_user_id?: string | null;
  teams_since?: Date | string | null;
  sharepoint?: SharePointConfig | null;
}

const COLS =
  "id, company_id, owner_user_id, target, refresh_token, account, folder, last_sync, tenant_id, ms_user_id, teams_since, sharepoint";

/** Key de la conexión de un usuario para un destino dado. */
export function connKey(
  companyId: string,
  ownerUserId: string,
  target: ConnTarget
): ConnKey {
  return { companyId, ownerUserId, target };
}

/** Key a partir de una conexión existente. */
export function keyOfConnection(conn: OneDriveConnection): ConnKey {
  return {
    companyId: conn.company_id,
    ownerUserId: conn.owner_user_id,
    target: conn.target,
  };
}

export async function getConnection(
  key: ConnKey
): Promise<OneDriveConnection | null> {
  await ensureTenancy();
  const rows = await query<OneDriveConnection>(
    `select ${COLS} from onedrive_connections
     where owner_user_id = $1 and target = $2`,
    [key.ownerUserId, key.target]
  );
  return rows[0] ?? null;
}

export async function upsertConnection(
  key: ConnKey,
  patch: ConnectionPatch
): Promise<OneDriveConnection> {
  await ensureTenancy();
  const cur = await getConnection(key);
  const pick = <T>(v: T | undefined, fallback: T | null | undefined): T | null =>
    v !== undefined ? v : fallback ?? null;

  const folder = patch.folder ?? cur?.folder ?? "ObsiAgent";
  const refresh = pick(patch.refresh_token, cur?.refresh_token);
  const account = pick(patch.account, cur?.account);
  const tenantId = pick(patch.tenant_id, cur?.tenant_id);
  const msUserId = pick(patch.ms_user_id, cur?.ms_user_id);
  const lastSync = pick(patch.last_sync, cur?.last_sync);
  const lastSyncJson = lastSync ? JSON.stringify(lastSync) : null;
  const teamsSince = pick(patch.teams_since, cur?.teams_since);
  const sharepoint = pick(patch.sharepoint, cur?.sharepoint);
  const sharepointJson = sharepoint ? JSON.stringify(sharepoint) : null;

  if (cur) {
    await query(
      `update onedrive_connections
         set refresh_token = $3, account = $4, folder = $5, last_sync = $6,
             tenant_id = $7, ms_user_id = $8, teams_since = $9, sharepoint = $10,
             updated_at = now()
       where owner_user_id = $1 and target = $2`,
      [key.ownerUserId, key.target, refresh, account, folder, lastSyncJson, tenantId, msUserId, teamsSince, sharepointJson]
    );
  } else {
    await query(
      `insert into onedrive_connections
         (company_id, owner_user_id, target, refresh_token, account, folder, last_sync, tenant_id, ms_user_id, teams_since, sharepoint)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [key.companyId, key.ownerUserId, key.target, refresh, account, folder, lastSyncJson, tenantId, msUserId, teamsSince, sharepointJson]
    );
  }
  return (await getConnection(key))!;
}

/** Olvida credenciales (mantiene la carpeta elegida). */
export async function disconnect(key: ConnKey): Promise<void> {
  await upsertConnection(key, {
    refresh_token: null,
    account: null,
    last_sync: null,
  });
}

/** Todas las conexiones conectadas (con token). Para el cron que sincroniza todo. */
export async function listConnectedConnections(): Promise<OneDriveConnection[]> {
  await ensureTenancy();
  return query<OneDriveConnection>(
    `select ${COLS} from onedrive_connections where refresh_token is not null`
  );
}

/** Access token válido para una conexión, rotando y persistiendo el refresh token.
 *  La conexión de TRABAJO (target='company') usa scopes "full" (incluye Teams). */
export async function getAccessToken(key: ConnKey): Promise<string> {
  const conn = await getConnection(key);
  if (!conn?.refresh_token) throw new Error("OneDrive no está conectado.");
  const full = key.target === "company";
  const tok = await refreshAccessToken(conn.refresh_token, full);
  if (tok.refresh_token && tok.refresh_token !== conn.refresh_token) {
    await upsertConnection(key, { refresh_token: tok.refresh_token });
  }
  return tok.access_token;
}

/** Base de conocimiento a la que alimenta una conexión. */
export function scopeOfConnection(conn: OneDriveConnection): Scope {
  return conn.target === "company"
    ? companyScope(conn.company_id)
    : personalScope(conn.company_id, conn.owner_user_id);
}
