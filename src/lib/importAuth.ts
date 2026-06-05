// Autorización simple por token para los endpoints de importación/reindex.
import { NextRequest } from "next/server";
import { env } from "./env";

/** True si la petición trae el token correcto (header x-import-token o ?token=). */
export function isImportAuthorized(req: NextRequest): boolean {
  const token = env.bulkImportToken;
  if (!token) return false; // si no se configuró BULK_IMPORT_TOKEN, se bloquea
  const provided =
    req.headers.get("x-import-token") ||
    new URL(req.url).searchParams.get("token") ||
    "";
  return provided === token;
}
