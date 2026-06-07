// GET /api/onedrive/connect?scope=company|personal — inicia OAuth de OneDrive.
// 'company' requiere superadmin; 'personal' (default) es del usuario actual.
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { authorizeUrl } from "@/lib/onedrive";
import { getCurrentUser } from "@/lib/currentUser";
import { cookieSecure } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!env.microsoft.clientId || !env.microsoft.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Faltan MS_CLIENT_ID / MS_CLIENT_SECRET en el .env" },
      { status: 500 }
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const scope =
    new URL(req.url).searchParams.get("scope") === "company"
      ? "company"
      : "personal";
  if (scope === "company" && user.role !== "superadmin") {
    return NextResponse.json(
      { error: "Solo el superadmin conecta la carpeta empresarial." },
      { status: 403 }
    );
  }

  const state = crypto.randomUUID();
  // Empresarial pide scopes "full" (incluye lectura de transcripciones de Teams).
  const res = NextResponse.redirect(authorizeUrl(state, scope === "company"));
  const opts = {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("od_state", state, opts);
  res.cookies.set("od_scope", scope, opts);
  return res;
}
