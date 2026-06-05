// Acceso al vault de Obsidian: leer/escribir archivos .md, parsear frontmatter
// y wikilinks. La fuente de verdad del conocimiento son estos archivos.
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { env } from "./env";
import type { NoteFrontmatter, VaultNote } from "./types";

// Ruta del vault resuelta perezosamente (no al importar, para no requerir la
// variable de entorno durante `next build`).
function vaultDir(): string {
  return env.vaultPath;
}

// Id de la nota índice (MOC) auto-generada. Las notas cuyo nombre empieza con
// "_" se consideran "de sistema": no se listan ni se indexan como notas
// normales, pero se pueden leer directamente por id (readNote).
export const MOC_ID = "_indice";

/** Convierte un título libre en un slug/nombre de archivo seguro (estilo Obsidian). */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[\\/:*?"<>|#^[\]]/g, "") // caracteres inválidos en nombres
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "nota";
}

/** Extrae los destinos de los wikilinks `[[Nota]]` o `[[Nota|alias]]` del cuerpo. */
export function parseWikilinks(body: string): string[] {
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const target = m[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

async function ensureVault(): Promise<void> {
  await fs.mkdir(vaultDir(), { recursive: true });
}

/** Lista los ids (slugs) de todas las notas .md del vault, recursivamente. */
export async function listNoteIds(): Promise<string[]> {
  await ensureVault();
  const ids: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".obsidian" || e.name === ".trash") continue;
        await walk(full);
      } else if (
        e.isFile() &&
        e.name.endsWith(".md") &&
        !e.name.startsWith("_") // omite notas de sistema (p.ej. el índice _indice.md)
      ) {
        ids.push(e.name.replace(/\.md$/, ""));
      }
    }
  }
  await walk(vaultDir());
  return ids;
}

/** Devuelve los títulos (o ids) de todas las notas, útil para sugerir enlaces. */
export async function listNoteTitles(): Promise<string[]> {
  const notes = await readAllNotes();
  return notes.map((n) => n.frontmatter.title || n.id);
}

function resolvePath(id: string): string {
  return path.join(vaultDir(), `${id}.md`);
}

export async function readNote(id: string): Promise<VaultNote | null> {
  try {
    const full = resolvePath(id);
    const raw = await fs.readFile(full, "utf8");
    const parsed = matter(raw);
    return {
      id,
      path: path.relative(vaultDir(), full),
      frontmatter: parsed.data as NoteFrontmatter,
      body: parsed.content.trim(),
    };
  } catch {
    return null;
  }
}

export async function readAllNotes(): Promise<VaultNote[]> {
  const ids = await listNoteIds();
  const notes = await Promise.all(ids.map((id) => readNote(id)));
  return notes.filter((n): n is VaultNote => n !== null);
}

/** Borra el archivo .md de una nota del vault. Devuelve true si existía. */
export async function deleteNote(id: string): Promise<boolean> {
  try {
    await fs.unlink(resolvePath(id));
    return true;
  } catch {
    return false; // el archivo puede no existir (p.ej. nota huérfana solo en DB)
  }
}

export interface WriteNoteInput {
  id: string;
  frontmatter: NoteFrontmatter;
  body: string;
  links?: string[]; // wikilinks a añadir al final si no están ya en el cuerpo
}

/** Escribe (o sobrescribe) una nota .md con frontmatter + cuerpo + enlaces. */
export async function writeNote(input: WriteNoteInput): Promise<VaultNote> {
  await ensureVault();
  const { id, frontmatter, body, links = [] } = input;

  let finalBody = body.trim();
  const existing = new Set(parseWikilinks(finalBody));
  const newLinks = links.filter((l) => l && !existing.has(l));
  if (newLinks.length > 0) {
    const section = newLinks.map((l) => `- [[${l}]]`).join("\n");
    finalBody += `\n\n## Relacionado\n${section}\n`;
  }

  const fileContents = matter.stringify(finalBody, frontmatter);
  const full = resolvePath(id);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, fileContents, "utf8");

  return {
    id,
    path: path.relative(vaultDir(), full),
    frontmatter,
    body: finalBody,
  };
}
