// Reconstruye el índice de la DB leyendo todas las notas .md del vault.
// Útil si editaste notas directamente en Obsidian (la DB se desincroniza).
// Uso:  npm run reindex
import "dotenv/config";

async function main() {
  // Import dinámico: las libs leen env al cargarse, así que cargamos dotenv antes.
  const { readAllNotes } = await import("../src/lib/vault");
  const { indexNote } = await import("../src/lib/indexer");
  const { rebuildMoc } = await import("../src/lib/moc");
  const { getBootstrapCompany, listUsers } = await import("../src/lib/tenancy");
  const { companyScope, personalScope, scopeSubdir } = await import("../src/lib/scope");
  const { pool } = await import("../src/lib/db");

  const company = await getBootstrapCompany();
  const scopes = [companyScope(company.id)];
  for (const u of await listUsers(company.id)) {
    scopes.push(personalScope(company.id, u.id));
  }

  for (const scope of scopes) {
    const subdir = scopeSubdir(scope);
    const notes = await readAllNotes(subdir);
    const label = scope.userId ? `personal/${scope.userId}` : "empresarial";
    console.log(`Reindexando ${notes.length} notas (${label})...`);
    let i = 0;
    for (const note of notes) {
      await indexNote(note, scope);
      i++;
      console.log(`  [${i}/${notes.length}] ${note.id}`);
    }
    await rebuildMoc(scope);
  }

  await pool.end();
  console.log("✓ Reindexado completo.");
}

main().catch((err) => {
  console.error("✗ Error reindexando:", err);
  process.exit(1);
});
