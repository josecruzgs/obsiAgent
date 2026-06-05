-- obsiAgent — esquema de base de datos (Postgres + pgvector)
-- La fuente de verdad son los archivos .md del vault; esta DB es un índice
-- consultable (metadatos + embeddings + grafo de enlaces).

create extension if not exists vector;

create table if not exists notes (
  id          text primary key,        -- slug = nombre de archivo sin .md
  path        text not null,           -- ruta relativa dentro del vault
  title       text,
  summary     text,
  tags        text[] default '{}',
  content     text,
  embedding   vector(1024),            -- voyage-3.5 => 1024 dimensiones
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

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
