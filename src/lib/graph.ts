// Construye el grafo de conocimiento a partir de notas y enlaces de la DB.
import { query } from "./db";
import type { GraphData, GraphEdge, GraphNode } from "./types";

interface NoteRow {
  id: string;
  title: string | null;
  tags: string[] | null;
}

interface LinkRow {
  source: string;
  target: string;
}

export async function buildGraph(): Promise<GraphData> {
  const notes = await query<NoteRow>(
    `select id, title, tags from notes order by id`
  );
  const links = await query<LinkRow>(`select source, target from links`);

  const ids = new Set(notes.map((n) => n.id));
  const titleToId = new Map<string, string>();
  for (const n of notes) {
    titleToId.set(n.id, n.id);
    if (n.title) titleToId.set(n.title, n.id);
  }

  // Cuenta grado para dimensionar nodos.
  const degree = new Map<string, number>();
  const edges: GraphEdge[] = [];
  for (const l of links) {
    // El target puede ser un título; resuélvelo a un id real si existe.
    const targetId = titleToId.get(l.target);
    if (!targetId || !ids.has(targetId) || targetId === l.source) continue;
    edges.push({ source: l.source, target: targetId });
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(targetId, (degree.get(targetId) ?? 0) + 1);
  }

  const nodes: GraphNode[] = notes.map((n) => ({
    id: n.id,
    title: n.title ?? n.id,
    tags: n.tags ?? [],
    val: 1 + (degree.get(n.id) ?? 0),
  }));

  return { nodes, edges };
}
