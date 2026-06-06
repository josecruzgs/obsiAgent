// Cierra sesión: borra la cookie y vuelve a /login. Acepta GET y POST.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

function clear(): NextResponse {
  const res = NextResponse.redirect(`${env.publicBaseUrl}/login`);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const GET = clear;
export const POST = clear;
