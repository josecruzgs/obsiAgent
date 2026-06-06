// Ajustes de la app persistidos en Postgres (tabla genérica key/value jsonb).
// Hoy solo guarda la conexión a OneDrive (token de refresco + carpeta + último
// sync). La tabla se crea de forma perezosa para no requerir migración manual
// (el flujo de deploy es `git pull && docker compose up -d`, sin `npm run migrate`).
import { query } from "./db";

export interface OneDriveSettings {
  refreshToken?: string; // token de refresco de Microsoft (NUNCA se envía al cliente)
  account?: string; // email/UPN de la cuenta conectada (informativo)
  folder: string; // carpeta de OneDrive a vigilar
  lastSync?: { at: string; ok: number; failed: number; error?: string };
}

const KEY = "onedrive";
const DEFAULTS: OneDriveSettings = { folder: "ObsiAgent" };

let _ensured = false;
async function ensureTable(): Promise<void> {
  if (_ensured) return;
  await query(`create table if not exists app_settings (
    key        text primary key,
    value      jsonb not null,
    updated_at timestamptz default now()
  )`);
  _ensured = true;
}

export async function getOneDrive(): Promise<OneDriveSettings> {
  await ensureTable();
  const rows = await query<{ value: OneDriveSettings }>(
    `select value from app_settings where key = $1`,
    [KEY]
  );
  return { ...DEFAULTS, ...(rows[0]?.value ?? {}) };
}

export async function setOneDrive(
  patch: Partial<OneDriveSettings>
): Promise<OneDriveSettings> {
  await ensureTable();
  const next = { ...(await getOneDrive()), ...patch };
  await query(
    `insert into app_settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [KEY, JSON.stringify(next)]
  );
  return next;
}

export async function clearOneDrive(): Promise<void> {
  await ensureTable();
  await query(`delete from app_settings where key = $1`, [KEY]);
}
