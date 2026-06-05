// Aplica db/schema.sql contra la base de datos configurada en DATABASE_URL.
// Uso:  npm run migrate
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");

  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ Migración aplicada (extensión vector + tablas + índices).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ Error en la migración:", err);
  process.exit(1);
});
