// GET /api/onedrive/connect — inicia el flujo OAuth: redirige a Microsoft.
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { authorizeUrl } from "@/lib/onedrive";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  if (!env.microsoft.clientId || !env.microsoft.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Faltan MS_CLIENT_ID / MS_CLIENT_SECRET en el .env" },
      { status: 500 }
    );
  }

  // `state` anti-CSRF: se guarda en cookie y se verifica en el callback.
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("od_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
