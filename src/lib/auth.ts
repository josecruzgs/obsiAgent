// Microsoft OIDC (Iniciar sesión con Microsoft). Reusa la app de Entra. El login
// normal pide, además de la identidad, los permisos delegados de Graph con
// offline_access: así una sola autorización al iniciar sesión deja OneDrive,
// Teams y SharePoint conectados sin un segundo OAuth (solo queda elegir carpetas
// y sitios en /config). Si la cuenta o el tenant no soporta esos scopes (p. ej.
// outlook.com personal, o falta de consentimiento del admin), el callback
// reintenta en modo "basic" (solo identidad) y las integraciones se conectan
// después desde /config como antes.
import { env } from "./env";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

// Fallback: solo identidad, funciona con cualquier cuenta.
const SCOPES_BASIC = "openid profile email";
// Identidad + Graph delegado. Mismo set que la conexión empresarial de OneDrive
// (ver onedrive.ts SCOPES_FULL) para que el refresh token obtenido al iniciar
// sesión sirva tal cual para OneDrive, Teams y SharePoint.
const SCOPES_FULL =
  "openid profile email offline_access User.Read Files.ReadWrite" +
  " OnlineMeetings.Read OnlineMeetingTranscript.Read.All Sites.Read.All";

function scopesFor(basic: boolean): string {
  return basic ? SCOPES_BASIC : SCOPES_FULL;
}

/** ¿El error del authorize sugiere que los scopes de Graph no aplican a esta
 *  cuenta (outlook.com) o tenant (falta consentimiento)? → reintentar basic. */
export function isScopeConsentError(msg: string): boolean {
  return /invalid_scope|consent|AADSTS65001|AADSTS70011|AADSTS650053|AADSTS90094|AADSTS500011/i.test(
    msg
  );
}

export function authRedirectUri(): string {
  return `${env.publicBaseUrl}/api/auth/callback`;
}

export function authorizeUrl(state: string, basic = false): string {
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: "code",
    redirect_uri: authRedirectUri(),
    response_mode: "query",
    scope: scopesFor(basic),
    state,
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export interface MicrosoftIdentity {
  email: string;
  oid: string;
  name: string | null;
  tenantId: string | null; // tid (para Teams app-only por-tenant)
  refreshToken: string | null; // solo en login full: permite conectar Graph sin 2º OAuth
}

/** Decodifica el payload de un JWT sin validar firma (viene del token endpoint vía TLS). */
function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  const pad = part.length % 4 ? "=".repeat(4 - (part.length % 4)) : "";
  const json = Buffer.from(
    part.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  ).toString("utf8");
  return JSON.parse(json);
}

/** POST con reintentos ante errores de red transitorios (ECONNRESET, etc.). */
async function postForm(url: string, body: URLSearchParams, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        return await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[auth] intento ${i + 1}/${attempts} falló:`, (e as Error)?.message);
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Intercambia el `code` por tokens y extrae la identidad del id_token. */
export async function exchangeCodeForIdentity(
  code: string,
  basic = false
): Promise<MicrosoftIdentity> {
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    redirect_uri: authRedirectUri(),
    grant_type: "authorization_code",
    code,
    scope: scopesFor(basic),
  });
  const res = await postForm(`${AUTHORITY}/token`, body);
  if (!res.ok) {
    throw new Error(`OAuth token ${res.status}: ${await res.text()}`);
  }
  const tok = (await res.json()) as { id_token?: string; refresh_token?: string };
  if (!tok.id_token) throw new Error("Microsoft no devolvió id_token.");

  const claims = decodeJwt(tok.id_token);
  const email = (
    (claims.email as string) ||
    (claims.preferred_username as string) ||
    ""
  ).toLowerCase();
  const oid = (claims.oid as string) || (claims.sub as string) || "";
  const name = (claims.name as string) || null;
  const tenantId = (claims.tid as string) || null;

  if (!email) throw new Error("La cuenta de Microsoft no expone un email.");
  return { email, oid, name, tenantId, refreshToken: tok.refresh_token ?? null };
}
