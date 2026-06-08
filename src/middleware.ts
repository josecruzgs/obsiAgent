// Protege toda la app: sin sesión válida -> /login (páginas) o 401 (API).
// Se exceptúan el flujo de login y los endpoints "de máquina" (webhooks/cron),
// que tienen su propia autenticación por token o son externos.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Rutas públicas o de máquina (no requieren sesión de usuario).
const PUBLIC_PREFIXES = [
  "/login",
  "/m", // magic link de acceso (token corto, un solo uso)
  "/api/auth", // flujo de login con Microsoft
  "/api/whatsapp", // webhook externo (Evolution API)
  "/api/bulk-import", // cron, protegido por token
  "/api/reindex", // protegido por token
  "/api/ingest-transcript", // Power Automate (Teams), protegido por token
  "/api/onedrive/sync", // cron (token) o UI (sesión); el route valida ambos
  "/api/teams/sync", // cron (token) o UI (sesión); el route valida ambos
  "/api/status", // status por cliente: cron (token) o superadmin; el route valida
  "/api/curator", // curador del grafo: cron (token) o superadmin; el route valida
  "/api/router", // enrutador: cron (token) o superadmin; el route valida
  "/api/voice", // agente de voz (Retell): protegido por token en el route
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (session) return NextResponse.next();

  // No autenticado.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Corre en todo salvo assets estáticos de Next, el favicon y los archivos
  // públicos (/images, /glow). Sin esto, las imágenes se redirigían a /login
  // cuando no hay sesión (p. ej. en la propia página de login).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|glow/).*)"],
};
