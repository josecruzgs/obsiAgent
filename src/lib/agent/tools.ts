// Herramientas para los agentes, acotadas a un ámbito (empresarial/personal).
// Fase 0: solo lectura (buscar / leer / listar). Las de escritura (crear,
// enlazar) se añadirán cuando un agente las necesite (status, WhatsApp).
import { query, toVectorLiteral } from "../db";
import { embedQuery } from "../embeddings";
import { readNote } from "../vault";
import { scopeSubdir, type Scope } from "../scope";
import type { AgentTool } from "./runtime";

interface NoteRow {
  id: string;
  title: string | null;
  summary: string | null;
  distance?: number;
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
        "Devuelve una lista de notas con su título, id y resumen.",
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
        `select id, title, summary, embedding <=> $1 as distance
           from notes
          where embedding is not null and ${SCOPE_SQL}
          order by embedding <=> $1
          limit $4`,
        [toVectorLiteral(vec), scope.companyId, scope.userId, k]
      );
      if (rows.length === 0) return "Sin resultados.";
      return rows
        .map(
          (r) =>
            `- "${r.title ?? r.id}" (id: ${r.id})${
              r.summary ? ` — ${r.summary}` : ""
            }`
        )
        .join("\n");
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
