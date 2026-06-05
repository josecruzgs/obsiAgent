import { Pool } from "pg";
import { env } from "./env";

// Pool perezoso y singleton: se crea en el primer uso (no al importar el módulo,
// para que `next build` no requiera DATABASE_URL). Se reutiliza entre recargas
// en dev para no agotar conexiones.
const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForPg._pgPool) {
    globalForPg._pgPool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
    });
  }
  return globalForPg._pgPool;
}

// Acceso conveniente (compatibilidad): expone el pool perezoso.
export const pool = {
  query: (...args: Parameters<Pool["query"]>) =>
    (getPool().query as (...a: unknown[]) => unknown)(...args),
  end: () => getPool().end(),
} as Pick<Pool, "query" | "end">;

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await getPool().query(text, params as never[]);
  return res.rows as T[];
}

// pgvector espera el formato '[1,2,3]' como texto al insertar.
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
