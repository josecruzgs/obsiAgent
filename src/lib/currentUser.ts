// Helper de servidor (runtime Node) para obtener el usuario autenticado a partir
// de la cookie de sesión, y exigir sesión/rol en API routes o páginas.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./session";
import { getUserById, type User } from "./tenancy";

/** Usuario actual o null. Valida la firma de la cookie y lo recarga de la DB. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  return getUserById(payload.uid);
}

/** Como getCurrentUser pero lanza si no hay sesión. Para API routes protegidas. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Exige sesión + rol superadmin. */
export async function requireSuperadmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "superadmin") throw new ForbiddenError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("No autenticado");
    this.name = "UnauthorizedError";
  }
}
export class ForbiddenError extends Error {
  constructor() {
    super("No autorizado");
    this.name = "ForbiddenError";
  }
}
