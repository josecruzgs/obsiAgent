-- obsiAgent — esquema de base de datos (Postgres + pgvector)
-- La fuente de verdad son los archivos .md del vault; esta DB es un índice
-- consultable (metadatos + embeddings + grafo de enlaces).

create extension if not exists vector;

-- Multi-empresa (tenancy). También se crean/siembran de forma perezosa desde el
-- código (src/lib/tenancy.ts) por si la DB ya existía antes de añadirlas.
create table if not exists companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email      text not null unique,
  name       text,
  role       text not null default 'member',     -- 'superadmin' | 'member'
  ms_oid     text unique,                        -- object id de Microsoft
  created_at timestamptz default now()
);

create table if not exists notes (
  id          text primary key,        -- slug = nombre de archivo sin .md
  path        text not null,           -- ruta relativa dentro del vault
  title       text,
  summary     text,
  tags        text[] default '{}',
  content     text,
  content_hash text,                   -- sha256 del contenido: salta re-ingestas idénticas
  embedding   vector(1024),            -- voyage-3.5 => 1024 dimensiones
  -- Scope: empresa dueña y, si es una nota personal, el usuario dueño (null = empresarial).
  company_id    uuid references companies(id) on delete cascade,
  owner_user_id uuid references users(id) on delete cascade,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists notes_scope_idx on notes (company_id, owner_user_id);

create table if not exists links (
  source text not null references notes(id) on delete cascade,
  target text not null,                -- puede apuntar a una nota aún inexistente
  primary key (source, target)
);

-- Índice ANN (HNSW) para búsqueda por similitud coseno.
-- Se usa HNSW en vez de ivfflat porque ivfflat es aproximado y, con pocas notas
-- y "lists" alto, puede devolver 0 resultados (solo revisa 1 lista por defecto).
-- HNSW da buena recall por defecto incluso con datasets pequeños o en crecimiento.
create index if not exists notes_embedding_idx
  on notes using hnsw (embedding vector_cosine_ops);

create index if not exists links_target_idx on links (target);

-- Ajustes de la app (key/value jsonb). P.ej. la conexión a OneDrive.
-- También se crea de forma perezosa desde el código (src/lib/settings.ts) por si
-- la DB ya existía antes de añadir esta tabla.
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);
