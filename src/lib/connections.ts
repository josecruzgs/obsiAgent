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
}

export interface ConnectionPatch {
  refresh_token?: string | null;
  account?: string | null;
  folder?: string;
  last_sync?: SyncSummary | null;
}

export async function getConnection(
  scope: Scope
): Promise<OneDriveConnection | null> {
  await ensureTenancy();
  const rows = await query<OneDriveConnection>(
    `select id, company_id, owner_user_id, refresh_token, account, folder, last_sync
     from onedrive_connections
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
  const folder = patch.folder ?? cur?.folder ?? "ObsiAgent";
  const refresh = patch.refresh_token !== undefined ? patch.refresh_token : cur?.refresh_token ?? null;
  const account = patch.account !== undefined ? patch.account : cur?.account ?? null;
  const lastSync = patch.last_sync !== undefined ? patch.last_sync : cur?.last_sync ?? null;
  const lastSyncJson = lastSync ? JSON.stringify(lastSync) : null;

  if (cur) {
    await query(
      `update onedrive_connections
         set refresh_token = $3, account = $4, folder = $5, last_sync = $6, updated_at = now()
       where company_id = $1 and owner_user_id is not distinct from $2`,
      [scope.companyId, scope.userId, refresh, account, folder, lastSyncJson]
    );
  } else {
    await query(
      `insert into onedrive_connections (company_id, owner_user_id, refresh_token, account, folder, last_sync)
       values ($1, $2, $3, $4, $5, $6)`,
      [scope.companyId, scope.userId, refresh, account, folder, lastSyncJson]
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
    `select id, company_id, owner_user_id, refresh_token, account, folder, last_sync
     from onedrive_connections where refresh_token is not null`
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
