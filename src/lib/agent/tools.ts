// Herramientas para los agentes, acotadas a un ámbito (empresarial/personal).
// Fase 0: solo lectura (buscar / leer / listar). Las de escritura (crear,
// enlazar) se añadirán cuando un agente las necesite (status, WhatsApp).
import { query, toVectorLiteral } from "../db";
import { embedQuery } from "../embeddings";
import { readNote } from "../vault";
import {
  scopeSubdir,
  companyScope,
  personalScope,
  readableNotesFilter,
  type Scope,
} from "../scope";
import { loadIngestContext, ingestText } from "../ingest";
import type { User } from "../tenancy";
import type { AgentTool } from "./runtime";

interface NoteRow {
  id: string;
  title: string | null;
  summary: string | null;
  content?: string | null;
  distance?: number;
}

/** Extracto de una línea del cuerpo de una nota. Permite que search_notes
 *  devuelva datos concretos (códigos, teléfonos, fechas) directamente, sin
 *  depender de que el agente abra la nota después con get_note. */
function excerpt(content: string | null | undefined, max = 600): string {
  const t = (content ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Formatea un resultado de search_notes: título, id, resumen y extracto. */
function formatHit(r: NoteRow): string {
  const ex = excerpt(r.content);
  return [
    `- "${r.title ?? r.id}" (id: ${r.id})`,
    r.summary ? `  resumen: ${r.summary}` : "",
    ex ? `  extracto: ${ex}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Filtro SQL del ámbito: notas de la empresa, empresariales (owner null) o del
// usuario dueño. `is not distinct from` maneja el null del ámbito empresarial.
const SCOPE_SQL = "company_id = $2 and owner_user_id is not distinct from $3";

/** Conjunto de herramientas de SOLO LECTURA para un ámbito. */
export function buildReadTools(scope: Scope): AgentTool[] {
  const subdir = scopeSubdir(scope);

  const search_notes: AgentTool = {
    def: {
      name: "search_notes",
      description:
        "Busca notas existentes por similitud semántica dentro de la base. " +
        "Úsalo para encontrar el proyecto o cliente relacionado y contexto previo. " +
        "Devuelve una lista de notas con su título, id, resumen y un extracto del contenido.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta en lenguaje natural" },
          k: { type: "integer", description: "Número de resultados (por defecto 5)" },
        },
        required: ["query"],
      },
    },
    run: async (input) => {
      const vec = await embedQuery(String(input.query ?? ""));
      const k = Math.min(Math.max(Number(input.k) || 5, 1), 15);
      const rows = await query<NoteRow>(
        `select id, title, summary, content, embedding <=> $1 as distance
           from notes
          where embedding is not null and ${SCOPE_SQL}
          order by embedding <=> $1
          limit $4`,
        [toVectorLiteral(vec), scope.companyId, scope.userId, k]
      );
      if (rows.length === 0) return "Sin resultados.";
      return rows.map(formatHit).join("\n\n");
    },
  };

  const get_note: AgentTool = {
    def: {
      name: "get_note",
      description:
        "Lee el contenido completo de una nota por su id (el id que devuelve search_notes).",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id de la nota" },
        },
        required: ["id"],
      },
    },
    run: async (input) => {
      const note = await readNote(String(input.id ?? ""), subdir);
      if (!note) return "No existe una nota con ese id en este ámbito.";
      const title = note.frontmatter.title ?? note.id;
      return `# ${title}\n\n${note.body.slice(0, 4000)}`;
    },
  };

  const list_notes: AgentTool = {
    def: {
      name: "list_notes",
      description:
        "Lista las notas más recientes del ámbito (título e id). Útil para tener panorama.",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Máximo de notas (por defecto 30)" },
        },
      },
    },
    run: async (input) => {
      const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 100);
      const rows = await query<NoteRow>(
        `select id, title, summary from notes
          where company_id = $1 and owner_user_id is not distinct from $2
          order by updated_at desc nulls last
          limit $3`,
        [scope.companyId, scope.userId, limit]
      );
      if (rows.length === 0) return "No hay notas en este ámbito.";
      return rows.map((r) => `- "${r.title ?? r.id}" (id: ${r.id})`).join("\n");
    },
  };

  return [search_notes, get_note, list_notes];
}

/** Herramientas de SOLO LECTURA para un USUARIO (ve su empresa + su personal).
 *  `sources`, si se pasa, acumula los ids de notas consultadas (para citar). */
export function buildUserReadTools(user: User, sources?: Set<string>): AgentTool[] {
  const search_notes: AgentTool = {
    def: {
      name: "search_notes",
      description:
        "Busca notas por similitud semántica en el conocimiento del usuario. " +
        "Puedes buscar varias veces con términos distintos. Devuelve título, id, " +
        "resumen y un extracto del contenido (úsalo para datos concretos como " +
        "códigos, teléfonos o fechas).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta en lenguaje natural" },
          k: { type: "integer", description: "Número de resultados (por defecto 6)" },
        },
        required: ["query"],
      },
    },
    run: async (input) => {
      const vec = await embedQuery(String(input.query ?? ""));
      const k = Math.min(Math.max(Number(input.k) || 6, 1), 15);
      const f = readableNotesFilter(user, 2); // $1 = vector
      const rows = await query<NoteRow>(
        `select id, title, summary, content, embedding <=> $1 as distance
           from notes
          where embedding is not null and ${f.sql}
          order by embedding <=> $1
          limit $${2 + f.params.length}`,
        [toVectorLiteral(vec), ...f.params, k]
      );
      if (rows.length === 0) return "Sin resultados.";
      // Incluimos un extracto del contenido para que datos concretos (códigos,
      // teléfonos, fechas) lleguen directo, sin depender de un get_note posterior.
      // Las fuentes reales se marcan en get_note (lo que el agente decide leer).
      return rows.map(formatHit).join("\n\n");
    },
  };

  const get_note: AgentTool = {
    def: {
      name: "get_note",
      description: "Lee el contenido completo de una nota por su id.",
      input_schema: {
        type: "object",
        properties: { id: { type: "string", description: "Id de la nota" } },
        required: ["id"],
      },
    },
    run: async (input) => {
      const id = String(input.id ?? "");
      const rows = await query<{ owner_user_id: string | null }>(
        `select owner_user_id from notes
          where id = $1 and company_id = $2 and (owner_user_id is null or owner_user_id = $3)`,
        [id, user.company_id, user.id]
      );
      if (rows.length === 0) return "No existe esa nota o no tienes acceso.";
      const subdir = rows[0].owner_user_id
        ? scopeSubdir(personalScope(user.company_id, user.id))
        : scopeSubdir(companyScope(user.company_id));
      const note = await readNote(id, subdir);
      if (!note) return "La nota no tiene archivo asociado.";
      sources?.add(id);
      return `# ${note.frontmatter.title ?? note.id}\n\n${note.body.slice(0, 4000)}`;
    },
  };

  const list_notes: AgentTool = {
    def: {
      name: "list_notes",
      description:
        "Lista las notas más recientes del usuario (título e id). Útil para panorama.",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Máximo de notas (por defecto 30)" },
        },
      },
    },
    run: async (input) => {
      const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 100);
      const f = readableNotesFilter(user, 1);
      const rows = await query<NoteRow>(
        `select id, title from notes where ${f.sql}
          order by updated_at desc nulls last limit $${1 + f.params.length}`,
        [...f.params, limit]
      );
      if (rows.length === 0) return "No hay notas.";
      return rows.map((r) => `- "${r.title ?? r.id}" (id: ${r.id})`).join("\n");
    },
  };

  return [search_notes, get_note, list_notes];
}

/** Herramienta de ESCRITURA: crear una nota en un ámbito. Para agentes que
 *  pueden actuar (p. ej. WhatsApp "guarda una nota …"). */
export function createNoteTool(scope: Scope, source = "agent"): AgentTool {
  return {
    def: {
      name: "create_note",
      description:
        "Crea una nota nueva en la base. Úsalo SOLO cuando el usuario pida explícitamente " +
        "guardar o crear algo; NO lo uses para responder preguntas.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título breve" },
          content: { type: "string", description: "Contenido en Markdown" },
        },
        required: ["title", "content"],
      },
    },
    run: async (input) => {
      const title = String(input.title ?? "").trim();
      const content = String(input.content ?? "").trim();
      if (!content) return "No se creó: contenido vacío.";
      const ctx = await loadIngestContext(scope);
      const r = await ingestText(content, title || undefined, ctx, { source });
      return `Nota creada: "${r.title}" (id: ${r.id}).`;
    },
  };
}
