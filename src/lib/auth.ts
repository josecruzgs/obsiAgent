// Microsoft OIDC (Iniciar sesión con Microsoft). Reusa la app de Entra: aquí solo
// pedimos identidad (openid profile email), distinto del flujo de OneDrive que
// pide Files.ReadWrite. Devuelve email + oid para identificar al usuario.
import { env } from "./env";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = "openid profile email";

export function authRedirectUri(): string {
  return `${env.publicBaseUrl}/api/auth/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: "code",
    redirect_uri: authRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export interface MicrosoftIdentity {
  email: string;
  oid: string;
  name: string | null;
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
  code: string
): Promise<MicrosoftIdentity> {
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    redirect_uri: authRedirectUri(),
    grant_type: "authorization_code",
    code,
    scope: SCOPES,
  });
  const res = await postForm(`${AUTHORITY}/token`, body);
  if (!res.ok) {
    throw new Error(`OAuth token ${res.status}: ${await res.text()}`);
  }
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) throw new Error("Microsoft no devolvió id_token.");

  const claims = decodeJwt(tok.id_token);
  const email = (
    (claims.email as string) ||
    (claims.preferred_username as string) ||
    ""
  ).toLowerCase();
  const oid = (claims.oid as string) || (claims.sub as string) || "";
  const name = (claims.name as string) || null;

  if (!email) throw new Error("La cuenta de Microsoft no expone un email.");
  return { email, oid, name };
}
