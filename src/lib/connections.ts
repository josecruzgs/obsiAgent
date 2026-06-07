// Conexiones a OneDrive por ámbito (empresarial o personal), persistidas en la
// tabla onedrive_connections. Maneja el refresh token y su rotación.
import { query } from "./db";
import { ensureTenancy } from "./tenancy";
import { refreshAccessToken } from "./onedrive";
import type { Scope } from "./scope";

export interface SyncSummary {
  at: string;
  ok: number;
  failed: number;
  error?: string;
}

export interface OneDriveConnection {
  id: string;
  company_id: string;
  owner_user_id: string | null;
  refresh_token: string | null;
  account: string | null;
  folder: string;
  last_sync: SyncSummary | null;
  tenant_id: string | null; // tid de Microsoft (para Teams app-only)
  ms_user_id: string | null; // oid/GUID del usuario (organizador de reuniones)
  teams_since: Date | null; // corte: solo grabaciones creadas después de esta marca
}

export interface ConnectionPatch {
  refresh_token?: string | null;
  account?: string | null;
  folder?: string;
  last_sync?: SyncSummary | null;
  tenant_id?: string | null;
  ms_user_id?: string | null;
  teams_since?: Date | string | null;
}

const COLS =
  "id, company_id, owner_user_id, refresh_token, account, folder, last_sync, tenant_id, ms_user_id, teams_since";

export async function getConnection(
  scope: Scope
): Promise<OneDriveConnection | null> {
  await ensureTenancy();
  const rows = await query<OneDriveConnection>(
    `select ${COLS} from onedrive_connections
     where company_id = $1 and owner_user_id is not distinct from $2`,
    [scope.companyId, scope.userId]
  );
  return rows[0] ?? null;
}

export async function upsertConnection(
  scope: Scope,
  patch: ConnectionPatch
): Promise<OneDriveConnection> {
  await ensureTenancy();
  const cur = await getConnection(scope);
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

  if (cur) {
    await query(
      `update onedrive_connections
         set refresh_token = $3, account = $4, folder = $5, last_sync = $6,
             tenant_id = $7, ms_user_id = $8, teams_since = $9, updated_at = now()
       where company_id = $1 and owner_user_id is not distinct from $2`,
      [scope.companyId, scope.userId, refresh, account, folder, lastSyncJson, tenantId, msUserId, teamsSince]
    );
  } else {
    await query(
      `insert into onedrive_connections
         (company_id, owner_user_id, refresh_token, account, folder, last_sync, tenant_id, ms_user_id, teams_since)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [scope.companyId, scope.userId, refresh, account, folder, lastSyncJson, tenantId, msUserId, teamsSince]
    );
  }
  return (await getConnection(scope))!;
}

/** Olvida credenciales (mantiene la carpeta elegida). */
export async function disconnect(scope: Scope): Promise<void> {
  await upsertConnection(scope, {
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

/** Access token válido para un scope, rotando y persistiendo el refresh token.
 *  La conexión EMPRESARIAL (userId null) usa scopes "full" (incluye Teams). */
export async function getAccessToken(scope: Scope): Promise<string> {
  const conn = await getConnection(scope);
  if (!conn?.refresh_token) throw new Error("OneDrive no está conectado.");
  const full = scope.userId === null;
  const tok = await refreshAccessToken(conn.refresh_token, full);
  if (tok.refresh_token && tok.refresh_token !== conn.refresh_token) {
    await upsertConnection(scope, { refresh_token: tok.refresh_token });
  }
  return tok.access_token;
}

export function scopeOfConnection(conn: OneDriveConnection): Scope {
  return { companyId: conn.company_id, userId: conn.owner_user_id };
}
