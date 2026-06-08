// Modelo multi-empresa (tenancy): empresas y usuarios, con bootstrap idempotente.
// El esquema se crea/migra de forma perezosa (igual que app_settings) para no
// requerir migración manual en el VPS (deploy = git pull && docker compose up).
import { query } from "./db";
import { env } from "./env";

export type Role = "superadmin" | "member";

export interface Company {
  id: string;
  name: string;
}

export interface User {
  id: string;
  company_id: string;
  email: string;
  name: string | null;
  role: Role;
  ms_oid: string | null; // object id de Microsoft (se rellena al primer login)
  phone: string | null; // teléfono de WhatsApp (para magic link)
}

let _ready: Promise<void> | null = null;

/** Crea tablas/columnas y siembra la empresa + superadmin. Idempotente y cacheado. */
export function ensureTenancy(): Promise<void> {
  if (!_ready) _ready = run();
  return _ready;
}

async function run(): Promise<void> {
  await query(`create table if not exists companies (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    created_at timestamptz default now()
  )`);

  await query(`create table if not exists users (
    id         uuid primary key default gen_random_uuid(),
    company_id uuid not null references companies(id) on delete cascade,
    email      text not null unique,
    name       text,
    role       text not null default 'member',
    ms_oid     text unique,
    created_at timestamptz default now()
  )`);

  // Teléfono de WhatsApp por usuario (para el magic link de acceso).
  await query(`alter table users add column if not exists phone text`);
  await query(
    `create unique index if not exists users_phone_uidx on users (phone) where phone is not null`
  );

  // Scope de las notas: a qué empresa pertenecen y, si es personal, de quién.
  await query(
    `alter table notes add column if not exists company_id uuid references companies(id) on delete cascade`
  );
  await query(
    `alter table notes add column if not exists owner_user_id uuid references users(id) on delete cascade`
  );
  await query(
    `create index if not exists notes_scope_idx on notes (company_id, owner_user_id)`
  );

  // Clave externa para idempotencia (p.ej. id de transcripción de Teams): evita
  // reingerir la misma fuente cuando un flujo de sondeo la manda varias veces.
  await query(`alter table notes add column if not exists external_id text`);
  await query(
    `create unique index if not exists notes_external_id_uidx
       on notes (external_id) where external_id is not null`
  );

  // Conexiones a OneDrive por ámbito: empresarial (owner null) o personal (por usuario).
  await query(`create table if not exists onedrive_connections (
    id            uuid primary key default gen_random_uuid(),
    company_id    uuid not null references companies(id) on delete cascade,
    owner_user_id uuid references users(id) on delete cascade,
    refresh_token text,
    account       text,
    folder        text not null default 'ObsiAgent',
    last_sync     jsonb,
    updated_at    timestamptz default now()
  )`);
  // Identidad Microsoft de la cuenta conectada, para Teams app-only por-tenant:
  // tenant_id (tid) y ms_user_id (oid/GUID del usuario). Se capturan al conectar.
  await query(`alter table onedrive_connections add column if not exists tenant_id text`);
  await query(`alter table onedrive_connections add column if not exists ms_user_id text`);
  // Corte para Teams: solo se ingieren grabaciones creadas DESPUÉS de esta marca
  // (se fija "ahora" en la primera sincronización para no traer el backlog viejo).
  await query(
    `alter table onedrive_connections add column if not exists teams_since timestamptz`
  );
  // Una sola conexión empresarial por empresa, y una personal por usuario.
  await query(
    `create unique index if not exists onedrive_conn_company_uidx
       on onedrive_connections (company_id) where owner_user_id is null`
  );
  await query(
    `create unique index if not exists onedrive_conn_user_uidx
       on onedrive_connections (owner_user_id) where owner_user_id is not null`
  );

  await seed();
}

async function seed(): Promise<void> {
  const companyName = env.bootstrapCompany;
  const email = env.superadminEmail;

  // Empresa inicial (iAgent).
  let company = (
    await query<Company>(`select id, name from companies where name = $1`, [
      companyName,
    ])
  )[0];
  if (!company) {
    company = (
      await query<Company>(
        `insert into companies (name) values ($1) returning id, name`,
        [companyName]
      )
    )[0];
  }

  // Superadmin inicial.
  const existing = (
    await query<User>(`select id from users where email = $1`, [email])
  )[0];
  if (!existing) {
    await query(
      `insert into users (company_id, email, name, role)
       values ($1, $2, $3, 'superadmin')`,
      [company.id, email, companyName + " superadmin"]
    );
  }

  // Migra notas sin empresa al ámbito empresarial de iAgent (single-tenant -> tenant).
  await query(`update notes set company_id = $1 where company_id is null`, [
    company.id,
  ]);

  // Migra la conexión OneDrive single-tenant (app_settings.onedrive) a conexión
  // EMPRESARIAL. app_settings puede no existir todavía -> se ignora el error.
  try {
    const old = await query<{ value: OldOneDrive }>(
      `select value from app_settings where key = 'onedrive'`
    );
    const v = old[0]?.value;
    if (v?.refreshToken) {
      const has = await query(
        `select 1 from onedrive_connections where company_id = $1 and owner_user_id is null`,
        [company.id]
      );
      if (has.length === 0) {
        await query(
          `insert into onedrive_connections (company_id, owner_user_id, refresh_token, account, folder, last_sync)
           values ($1, null, $2, $3, $4, $5)`,
          [
            company.id,
            v.refreshToken,
            v.account ?? null,
            v.folder ?? "ObsiAgent",
            v.lastSync ? JSON.stringify(v.lastSync) : null,
          ]
        );
      }
      await query(`delete from app_settings where key = 'onedrive'`);
    }
  } catch {
    /* app_settings no existe o no hay nada que migrar */
  }
}

interface OldOneDrive {
  refreshToken?: string;
  account?: string;
  folder?: string;
  lastSync?: unknown;
}

/** Empresa por defecto (la del bootstrap, p.ej. iAgent). Para flujos sin sesión. */
export async function getBootstrapCompany(): Promise<Company> {
  await ensureTenancy();
  const rows = await query<Company>(
    `select id, name from companies where name = $1`,
    [env.bootstrapCompany]
  );
  if (rows[0]) return rows[0];
  // Si no existe (caso raro), devuelve la primera empresa.
  const any = await query<Company>(`select id, name from companies order by created_at limit 1`);
  return any[0];
}

/** Usuario "dueño" de la empresa por defecto (superadmin) para flujos sin
 *  sesión (WhatsApp/voz). Buscar como él permite que el agente vea tanto la
 *  base EMPRESARIAL como sus notas PERSONALES. */
export async function getBootstrapOwner(): Promise<User | null> {
  const company = await getBootstrapCompany();
  if (!company) return null;
  const rows = await query<User>(
    `select id, company_id, email, name, role, ms_oid, phone from users
     where company_id = $1
     order by (role = 'superadmin') desc, created_at
     limit 1`,
    [company.id]
  );
  return rows[0] ?? null;
}

export async function getCompany(id: string): Promise<Company | null> {
  await ensureTenancy();
  return (
    (await query<Company>(`select id, name from companies where id = $1`, [id]))[0] ??
    null
  );
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureTenancy();
  return (
    (
      await query<User>(
        `select id, company_id, email, name, role, ms_oid, phone from users where email = $1`,
        [email.toLowerCase()]
      )
    )[0] ?? null
  );
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureTenancy();
  return (
    (
      await query<User>(
        `select id, company_id, email, name, role, ms_oid, phone from users where id = $1`,
        [id]
      )
    )[0] ?? null
  );
}

/** Marca el oid de Microsoft y el nombre en el primer login (si faltan). */
export async function linkMicrosoftIdentity(
  userId: string,
  oid: string,
  name: string | null
): Promise<void> {
  await query(
    `update users set ms_oid = coalesce(ms_oid, $2), name = coalesce(name, $3) where id = $1`,
    [userId, oid, name]
  );
}

export async function listUsers(companyId: string): Promise<User[]> {
  await ensureTenancy();
  return query<User>(
    `select id, company_id, email, name, role, ms_oid, phone from users
     where company_id = $1 order by created_at`,
    [companyId]
  );
}

export async function createUser(
  companyId: string,
  email: string,
  name: string | undefined,
  role: Role,
  phone?: string
): Promise<User> {
  await ensureTenancy();
  const rows = await query<User>(
    `insert into users (company_id, email, name, role, phone)
     values ($1, $2, $3, $4, $5)
     returning id, company_id, email, name, role, ms_oid, phone`,
    [companyId, email.trim().toLowerCase(), name?.trim() || null, role, normalizePhone(phone)]
  );
  return rows[0];
}

/** Normaliza a solo dígitos (o null si vacío). */
export function normalizePhone(phone?: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d || null;
}

/** Busca un usuario por teléfono (coincidencia por sufijo, tolerante a lada). */
export async function getUserByPhone(phone: string): Promise<User | null> {
  await ensureTenancy();
  const d = normalizePhone(phone);
  if (!d) return null;
  // Coincidencia flexible: el guardado puede traer/omitir el código de país.
  const rows = await query<User>(
    `select id, company_id, email, name, role, ms_oid, phone from users
     where phone is not null
       and (phone = $1 or right(phone, 10) = right($1, 10))
     limit 1`,
    [d]
  );
  return rows[0] ?? null;
}

/** Fija/actualiza el teléfono de un usuario (solo dígitos; null para borrar). */
export async function setUserPhone(id: string, phone: string | null): Promise<void> {
  await query(`update users set phone = $2 where id = $1`, [id, normalizePhone(phone)]);
}

/** Fija/actualiza el nombre de un usuario (null para borrar). */
export async function setUserName(id: string, name: string | null): Promise<void> {
  await query(`update users set name = $2 where id = $1`, [id, name?.trim() || null]);
}

export async function deleteUser(id: string): Promise<void> {
  await query(`delete from users where id = $1`, [id]);
}

export async function setUserRole(id: string, role: Role): Promise<void> {
  await query(`update users set role = $1 where id = $2`, [role, id]);
}

/** Nº de superadmins de una empresa (para no quedarte sin ninguno). */
export async function countSuperadmins(companyId: string): Promise<number> {
  const r = await query<{ n: number }>(
    `select count(*)::int as n from users where company_id = $1 and role = 'superadmin'`,
    [companyId]
  );
  return Number(r[0]?.n ?? 0);
}
