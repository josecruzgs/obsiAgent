// Sesión sin estado: un token firmado (HMAC-SHA256) guardado en cookie httpOnly.
// Usa Web Crypto (crypto.subtle), disponible tanto en el runtime Node de las API
// como en el runtime Edge del middleware, así ambos pueden verificarlo.
import { env } from "./env";

export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

export interface SessionPayload {
  uid: string;
  email: string;
  role: string;
  exp: number; // epoch en segundos
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Web Crypto tipa los bytes como BufferSource; con la lib estricta de TS hay que
// afirmar el tipo de los Uint8Array que pasamos a subtle.sign/verify.
function buf(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Firma un payload de sesión y devuelve el token `<payload>.<firma>`. */
export async function signSession(
  data: Omit<SessionPayload, "exp">
): Promise<string> {
  const payload: SessionPayload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    buf(new TextEncoder().encode(body))
  );
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verifica el token y devuelve el payload, o null si es inválido/expirado. */
export async function verifySession(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      buf(b64urlDecode(sig)),
      buf(new TextEncoder().encode(body))
    );
    if (!ok) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body))
    ) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** `Secure` solo cuando la app corre en https (en http://localhost debe ir
 *  sin Secure, o el navegador descarta la cookie y el login falla). */
export function cookieSecure(): boolean {
  return env.publicBaseUrl.startsWith("https");
}

/** Opciones de la cookie de sesión (httpOnly, segura en https). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  };
}
