// GET /api/auth/magic?t=<token> — inicia sesión con un magic link (enviado por
// WhatsApp). Valida el token firmado (HMAC, 10 min, un solo uso), crea la cookie
// de sesión y redirige a la app. Público (cae bajo el prefijo /api/auth).
import { NextRequest, NextResponse } from "next/server";
import {
  verifyMagicToken,
  signSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import { consumeJti } from "@/lib/magicLink";
import { getUserById } from "@/lib/tenancy";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function fail(reason: string): NextResponse {
  return NextResponse.redirect(
    `${env.publicBaseUrl}/login?error=${encodeURIComponent(reason)}`
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? undefined;
  const payload = await verifyMagicToken(token);
  if (!payload) return fail("El enlace de acceso no es válido o expiró.");

  // Un solo uso: invalida el jti.
  if (!consumeJti(payload.jti, payload.exp)) {
    return fail("Ese enlace ya se usó. Pide otro por WhatsApp.");
  }

  const user = await getUserById(payload.uid);
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
