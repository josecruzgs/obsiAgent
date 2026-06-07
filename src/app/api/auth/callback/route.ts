// GET /api/auth/callback — recibe el code de Microsoft, identifica al usuario y
// crea la sesión. Solo entran usuarios pre-registrados (el superadmin se siembra
// en el bootstrap; el resto los crea el superadmin en la Fase 2).
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { exchangeCodeForIdentity } from "@/lib/auth";
import { getUserByEmail, linkMicrosoftIdentity } from "@/lib/tenancy";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

function back(params: string): NextResponse {
  return NextResponse.redirect(`${env.publicBaseUrl}/login?${params}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookieState = req.cookies.get("auth_state")?.value;

  if (oauthError) return back(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state || state !== cookieState) {
    return back("error=estado_invalido");
  }

  try {
    const identity = await exchangeCodeForIdentity(code);

    const user = await getUserByEmail(identity.email);
    if (!user) {
      // No está dado de alta: acceso denegado (el superadmin debe crearlo).
      return back(
        `error=${encodeURIComponent(
          `La cuenta ${identity.email} no tiene acceso. Pide a un administrador que te dé de alta.`
        )}`
      );
    }

    // Vincula el oid de Microsoft y el nombre la primera vez.
    await linkMicrosoftIdentity(user.id, identity.oid, identity.name);

    const token = await signSession({
      uid: user.id,
      email: user.email,
      role: user.role,
    });

    const res = NextResponse.redirect(`${env.publicBaseUrl}/`);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.delete("auth_state");
    return res;
  } catch (err) {
    console.error("[auth] callback error:", err);
    const msg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return back(`error=${encodeURIComponent(msg || "error_desconocido")}`);
  }
}
