// GET /api/auth/callback — recibe el code de Microsoft, identifica al usuario y
// crea la sesión. Solo entran usuarios pre-registrados (el superadmin se siembra
// en el bootstrap; el resto los crea el superadmin en la Fase 2).
//
// El login pide también los permisos delegados de Graph (ver auth.ts): si la
// autorización trae refresh_token, aquí se guarda como conexión de OneDrive/
// Teams/SharePoint para que el usuario no tenga que hacer un segundo OAuth en
// /config. Si el tenant/cuenta rechaza esos scopes, se reintenta el login en
// modo "basic" (solo identidad).
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  authorizeUrl,
  exchangeCodeForIdentity,
  isScopeConsentError,
  type MicrosoftIdentity,
} from "@/lib/auth";
import { getUserByEmail, linkMicrosoftIdentity, type User } from "@/lib/tenancy";
import {
  SESSION_COOKIE,
  signSession,
  sessionCookieOptions,
  cookieSecure,
} from "@/lib/session";
import { upsertConnection, connKey } from "@/lib/connections";

export const runtime = "nodejs";

function back(params: string): NextResponse {
  return NextResponse.redirect(`${env.publicBaseUrl}/login?${params}`);
}

/** Persiste el refresh token del login como la conexión de TRABAJO del admin
 *  (target='company' → vault compartido). Solo para admins (los miembros solo
 *  consultan). El OneDrive personal se conecta aparte en /config (puede ser otra
 *  cuenta), así no se pisa con la del login. */
async function saveLoginConnections(
  user: User,
  identity: MicrosoftIdentity
): Promise<void> {
  if (user.role !== "superadmin") return;
  await upsertConnection(connKey(user.company_id, user.id, "company"), {
    refresh_token: identity.refreshToken,
    account: identity.email,
    tenant_id: identity.tenantId,
    ms_user_id: identity.oid || null,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookieState = req.cookies.get("auth_state")?.value;
  const basic = req.cookies.get("auth_basic")?.value === "1";

  if (oauthError) {
    // Los scopes de Graph no aplican a esta cuenta/tenant: reintenta el login
    // pidiendo solo identidad (las integraciones se conectan luego en /config).
    if (!basic && isScopeConsentError(oauthError)) {
      const retryState = crypto.randomUUID();
      const res = NextResponse.redirect(authorizeUrl(retryState, true));
      const opts = {
        httpOnly: true,
        secure: cookieSecure(),
        sameSite: "lax" as const,
        maxAge: 600,
        path: "/",
      };
      res.cookies.set("auth_state", retryState, opts);
      res.cookies.set("auth_basic", "1", opts);
      return res;
    }
    return back(`error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state || state !== cookieState) {
    return back("error=estado_invalido");
  }

  try {
    const identity = await exchangeCodeForIdentity(code, basic);

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

    // Conexión automática de OneDrive/Teams/SharePoint con el token del login.
    // Si falla, el login sigue: el usuario puede conectar a mano en /config.
    if (identity.refreshToken) {
      try {
        await saveLoginConnections(user, identity);
      } catch (err) {
        console.warn("[auth] no se pudo guardar la conexión de Graph:", err);
      }
    }

    const token = await signSession({
      uid: user.id,
      email: user.email,
      role: user.role,
    });

    const res = NextResponse.redirect(`${env.publicBaseUrl}/`);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.delete("auth_state");
    res.cookies.delete("auth_basic");
    return res;
  } catch (err) {
    console.error("[auth] callback error:", err);
    const msg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return back(`error=${encodeURIComponent(msg || "error_desconocido")}`);
  }
}
