// GET /api/auth/login — inicia el login con Microsoft (redirige a Entra).
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { authorizeUrl } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!env.microsoft.clientId || !env.microsoft.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Faltan MS_CLIENT_ID / MS_CLIENT_SECRET en el .env" },
      { status: 500 }
    );
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("auth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
