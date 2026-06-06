// Helper para responder errores de autorización en las API de admin.
import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "./currentUser";

/** Convierte los errores de auth en respuestas 401/403; null si no es de auth. */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}
