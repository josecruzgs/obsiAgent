// Limpia notas duplicadas (mismo título, sin external_id). Ver src/lib/dedupe.ts.
// Uso:
//   npx tsx scripts/dedupe-notes.ts            # DRY-RUN (no borra nada)
//   npx tsx scripts/dedupe-notes.ts --apply    # ejecuta el borrado
import "dotenv/config";

async function main() {
  const apply = process.argv.includes("--apply");
  const { dedupeNullExternalIdNotes } = await import("../src/lib/dedupe");
  const { pool } = await import("../src/lib/db");

  const r = await dedupeNullExternalIdNotes(apply);
  console.log(JSON.stringify(r, null, 2));
  if (!apply) console.log("\n(DRY-RUN) Re-ejecuta con --apply para aplicar.");
  await pool.end();
}

main().catch((err) => {
  console.error("✗ Error en dedupe:", err);
  process.exit(1);
});
