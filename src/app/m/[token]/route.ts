// GET /m/<token> — magic link de acceso (corto). Valida el token de un solo uso,
// crea la cookie de sesión y redirige a la app. Público (prefijo /m).
import { NextRequest, NextResponse } from "next/server";
import { consumeMagicToken } from "@/lib/magicLink";
import {
  signSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import { getUserById } from "@/lib/tenancy";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function fail(reason: string): NextResponse {
  return NextResponse.redirect(
    `${env.publicBaseUrl}/login?error=${encodeURIComponent(reason)}`
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const uid = consumeMagicToken(token);
  if (!uid) return fail("El enlace de acceso no es válido o expiró.");

  const user = await getUserById(uid);
  if (!user) return fail("La cuenta ya no existe.");

  const sessionToken = await signSession({
    uid: user.id,
    email: user.email,
    role: user.role,
  });
  const res = NextResponse.redirect(`${env.publicBaseUrl}/`);
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return res;
}
