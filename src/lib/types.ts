// Tipos compartidos entre librerías, API y UI.

export interface NoteFrontmatter {
  title?: string;
  summary?: string;
  tags?: string[];
  created?: string;
  [key: string]: unknown;
}

export interface VaultNote {
  id: string; // slug = nombre de archivo sin .md
  path: string; // ruta relativa dentro del vault
  frontmatter: NoteFrontmatter;
  body: string; // contenido markdown sin frontmatter
}

export interface NoteRecord {
  id: string;
  path: string;
  title: string | null;
  summary: string | null;
  tags: string[];
  content: string | null;
  created_at?: string;
  updated_at?: string;
}

// Salida estructurada de la digestión con Claude.
export interface DigestResult {
  title: string;
  summary: string;
  tags: string[];
  suggestedLinks: string[]; // ids/títulos de notas existentes a enlazar
}

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  val: number; // tamaño del nodo (p.ej. nº de conexiones)
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RetrievedNote {
  id: string;
  title: string | null;
  summary: string | null;
  content: string | null;
  score: number; // similitud (1 - distancia coseno)
}

export interface RagAnswer {
  answer: string;
  sources: { id: string; title: string | null }[];
}
