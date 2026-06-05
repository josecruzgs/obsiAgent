// Reconstruye el índice de la DB leyendo todas las notas .md del vault.
// Útil si editaste notas directamente en Obsidian (la DB se desincroniza).
// Uso:  npm run reindex
import "dotenv/config";

async function main() {
  // Import dinámico: las libs leen env al cargarse, así que cargamos dotenv antes.
  const { readAllNotes } = await import("../src/lib/vault");
  const { indexNote } = await import("../src/lib/indexer");
  const { pool } = await import("../src/lib/db");

  const notes = await readAllNotes();
  console.log(`Reindexando ${notes.length} notas...`);

  let i = 0;
  for (const note of notes) {
    await indexNote(note);
    i++;
    console.log(`  [${i}/${notes.length}] ${note.id}`);
  }

  await pool.end();
  console.log("✓ Reindexado completo.");
}

main().catch((err) => {
  console.error("✗ Error reindexando:", err);
  process.exit(1);
});
