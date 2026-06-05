// Genera la nota índice (MOC = Map of Content) del vault: una nota maestra con
// la lista de todas las notas + su resumen y tags. Se regenera al ingerir y la
// usa el RAG como "panorama" para preguntas amplias.
//
// El MOC se guarda como _indice.md (nota de sistema): NO se indexa con embedding
// ni aparece en /graph; el buscador lo lee directo del vault.
import { readAllNotes, writeNote, MOC_ID } from "./vault";

/** Reconstruye _indice.md a partir de todas las notas reales del vault. */
export async function rebuildMoc(): Promise<void> {
  const notes = await readAllNotes(); // ya excluye notas "_" de sistema
  notes.sort((a, b) =>
    (a.frontmatter.title ?? a.id).localeCompare(b.frontmatter.title ?? b.id)
  );

  const lines = notes.map((n) => {
    const title = n.frontmatter.title ?? n.id;
    const tags =
      Array.isArray(n.frontmatter.tags) && n.frontmatter.tags.length
        ? ` _(${n.frontmatter.tags.map((t) => `#${t}`).join(" ")})_`
        : "";
    const summary = n.frontmatter.summary ? ` — ${n.frontmatter.summary}` : "";
    // Texto plano (sin [[ ]]) para no llenar el grafo de enlaces desde el índice.
    return `- **${title}**${tags}${summary}`;
  });

  const body =
    `Índice automático del vault (${notes.length} notas). ` +
    `Panorama de todo el conocimiento disponible.\n\n` +
    lines.join("\n");

  await writeNote({
    id: MOC_ID,
    frontmatter: {
      title: "Índice del vault",
      summary: `Mapa de ${notes.length} notas con sus resúmenes y tags.`,
      tags: ["indice"],
      created: new Date().toISOString(),
    },
    body,
  });
}
