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
        `select id, company_id, email, name, role, ms_oid from users where email = $1`,
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
        `select id, company_id, email, name, role, ms_oid from users where id = $1`,
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
    `select id, company_id, email, name, role, ms_oid from users
     where company_id = $1 order by created_at`,
    [companyId]
  );
}

export async function createUser(
  companyId: string,
  email: string,
  name: string | undefined,
  role: Role
): Promise<User> {
  await ensureTenancy();
  const rows = await query<User>(
    `insert into users (company_id, email, name, role)
     values ($1, $2, $3, $4)
     returning id, company_id, email, name, role, ms_oid`,
    [companyId, email.trim().toLowerCase(), name?.trim() || null, role]
  );
  return rows[0];
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
