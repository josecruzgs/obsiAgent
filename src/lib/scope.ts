// Ámbito (scope) de las notas: empresarial (compartida por la empresa) o personal
// (privada de un usuario). Centraliza cómo se traduce un scope a:
//  - subcarpeta del vault en disco
//  - id de la nota índice (MOC)
//  - filtro de columnas en la DB (company_id / owner_user_id)
import type { User } from "./tenancy";

export interface Scope {
  companyId: string;
  userId: string | null; // null = empresarial; con valor = personal de ese usuario
}

export function companyScope(companyId: string): Scope {
  return { companyId, userId: null };
}
export function personalScope(companyId: string, userId: string): Scope {
  return { companyId, userId };
}

/**
 * Subcarpeta del vault para un scope.
 * Empresarial = raíz ("") para no mover las notas existentes; personal en
 * `personal/user-<id>`. (Asume una sola empresa; multi-empresa se revisará luego.)
 */
export function scopeSubdir(scope: Scope): string {
  return scope.userId ? `personal/user-${scope.userId}` : "";
}

/** Carpeta que NO se debe listar como empresarial al recorrer la raíz. */
export const PERSONAL_ROOT = "personal";

/** Id de la nota índice (MOC) por ámbito (los ids de nota son globales). */
export function mocId(scope: Scope): string {
  return scope.userId ? `_indice-user-${scope.userId}` : "_indice";
}

/** Id de la nota de bitácora (log) por ámbito. Nota de sistema ("_"): no se
 *  indexa ni aparece en el grafo/índice. */
export function logId(scope: Scope): string {
  return scope.userId ? `_log-user-${scope.userId}` : "_log";
}

/** Scopes que un usuario puede leer: la empresarial de su empresa + su personal. */
export function readableScopes(user: User): Scope[] {
  return [companyScope(user.company_id), personalScope(user.company_id, user.id)];
}

/**
 * Fragmento SQL (y params) para filtrar `notes` a lo que un usuario puede ver:
 * notas de su empresa que sean empresariales (owner null) o suyas.
 * `p1` es el índice del primer placeholder a usar (1-based).
 */
export function readableNotesFilter(
  user: User,
  p1: number
): { sql: string; params: unknown[] } {
  return {
    sql: `company_id = $${p1} and (owner_user_id is null or owner_user_id = $${p1 + 1})`,
    params: [user.company_id, user.id],
  };
}
