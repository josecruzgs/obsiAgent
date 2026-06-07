// Cliente mínimo de Microsoft Graph para OneDrive: OAuth (authorization code +
// refresh) y operaciones de archivos (listar carpeta, descargar, crear carpeta,
// mover). La persistencia/rotación del refresh_token vive en `connections` (DB).
import { env } from "./env";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

// offline_access -> refresh_token; Files.ReadWrite -> leer y mover archivos.
const SCOPES_BASIC = "offline_access User.Read Files.ReadWrite";
// Solo la conexión EMPRESARIAL (M365) pide además leer transcripciones de Teams.
// (Las cuentas personales outlook.com no soportan estos permisos.)
const SCOPES_FULL =
  SCOPES_BASIC + " OnlineMeetings.Read OnlineMeetingTranscript.Read.All";

function scopesFor(full: boolean): string {
  return full ? SCOPES_FULL : SCOPES_BASIC;
}

const SUPPORTED = [".md", ".markdown", ".txt", ".docx", ".pdf", ".vtt"];

/** Codifica cada segmento de una ruta conservando las barras `/`. */
function encPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export function redirectUri(): string {
  return `${env.publicBaseUrl}/api/onedrive/callback`;
}

export function authorizeUrl(state: string, full = false): string {
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: scopesFor(full),
    state,
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(
  extra: Record<string, string>
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    redirect_uri: redirectUri(),
    ...extra,
  });
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`OAuth token ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Intercambia el `code` del callback por tokens (incluye refresh_token). */
export function exchangeCode(code: string, full = false): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    scope: scopesFor(full),
  });
}

/** Refresca el access token a partir de un refresh token (sin persistir). */
export function refreshAccessToken(
  refreshToken: string,
  full = false
): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: scopesFor(full),
  });
}

async function graph(
  accessToken: string,
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Email/UPN de la cuenta conectada (informativo). */
export async function getAccount(accessToken: string): Promise<string> {
  const res = await graph(accessToken, "/me");
  if (!res.ok) return "";
  const j = (await res.json()) as Record<string, string>;
  return j.userPrincipalName || j.mail || j.displayName || "";
}

export interface DriveFile {
  id: string;
  name: string;
}

/**
 * Lista los archivos soportados del primer nivel de `folder` (ignora subcarpetas
 * como procesados/fallidos). Devuelve [] si la carpeta no existe todavía.
 */
export async function listFolderFiles(
  accessToken: string,
  folder: string
): Promise<DriveFile[]> {
  let url = `${GRAPH}/me/drive/root:/${encPath(
    folder
  )}:/children?$select=id,name,folder,file&$top=200`;
  const out: DriveFile[] = [];
  while (url) {
    const res = await graph(accessToken, url);
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Graph list ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as {
      value?: Array<{ id: string; name: string; folder?: unknown }>;
      "@odata.nextLink"?: string;
    };
    for (const it of j.value ?? []) {
      if (it.folder) continue; // subcarpetas (procesados/fallidos) se ignoran
      const dot = it.name.lastIndexOf(".");
      const ext = dot >= 0 ? it.name.slice(dot).toLowerCase() : "";
      if (SUPPORTED.includes(ext)) out.push({ id: it.id, name: it.name });
    }
    url = j["@odata.nextLink"] ?? "";
  }
  return out;
}

export async function downloadFile(
  accessToken: string,
  id: string
): Promise<Buffer> {
  const res = await graph(accessToken, `/me/drive/items/${id}/content`);
  if (!res.ok) throw new Error(`Graph download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Crea (si no existe) la subcarpeta `name` dentro de `parent` y devuelve su id. */
export async function ensureFolder(
  accessToken: string,
  parent: string,
  name: string
): Promise<string> {
  const full = `${parent}/${name}`;
  const get = await graph(accessToken, `/me/drive/root:/${encPath(full)}`);
  if (get.ok) return ((await get.json()) as { id: string }).id;

  const res = await graph(
    accessToken,
    `/me/drive/root:/${encPath(parent)}:/children`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    }
  );
  if (res.ok) return ((await res.json()) as { id: string }).id;
  if (res.status === 409) {
    // Creada por una corrida concurrente: vuelve a leerla.
    const g2 = await graph(accessToken, `/me/drive/root:/${encPath(full)}`);
    return ((await g2.json()) as { id: string }).id;
  }
  throw new Error(`Graph mkdir ${res.status}: ${await res.text()}`);
}

// ─── Transcripciones de reuniones de Teams (Graph, contexto APP-ONLY) ───────
// getAllTranscripts NO se permite en contexto delegado (error 412), así que se
// usa un token de aplicación (client_credentials) + una application access policy
// que autoriza a la app a leer las reuniones del organizador.

export interface MeetingTranscript {
  id: string;
  meetingId: string;
  createdDateTime?: string;
  organizer?: string;
}

/** Token app-only (client_credentials) para Microsoft Graph. */
export async function getAppToken(): Promise<string> {
  const tenant = env.microsoft.tenantId;
  if (!tenant) throw new Error("Falta MS_TENANT_ID en el .env (Directory ID).");
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) throw new Error(`App token ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Resuelve el GUID de un usuario a partir de su UPN/email (token app-only). */
export async function resolveUserId(
  appToken: string,
  upn: string
): Promise<string> {
  const res = await graph(appToken, `/users/${encodeURIComponent(upn)}?$select=id`);
  if (!res.ok) throw new Error(`Graph /users/${upn} ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/** Lista todas las transcripciones de reuniones organizadas por `userId`. */
export async function getAllTranscripts(
  appToken: string,
  userId: string
): Promise<MeetingTranscript[]> {
  let url = `${GRAPH}/users/${userId}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='${userId}')?$top=50`;
  const out: MeetingTranscript[] = [];
  while (url) {
    const res = await graph(appToken, url);
    if (res.status === 404) return out;
    if (!res.ok) {
      throw new Error(`Graph getAllTranscripts ${res.status}: ${await res.text()}`);
    }
    const j = (await res.json()) as {
      value?: Array<{
        id: string;
        meetingId: string;
        createdDateTime?: string;
        meetingOrganizer?: { user?: { displayName?: string; id?: string } };
      }>;
      "@odata.nextLink"?: string;
    };
    for (const t of j.value ?? []) {
      if (!t.id || !t.meetingId) continue;
      out.push({
        id: t.id,
        meetingId: t.meetingId,
        createdDateTime: t.createdDateTime,
        organizer:
          t.meetingOrganizer?.user?.displayName ||
          t.meetingOrganizer?.user?.id ||
          undefined,
      });
    }
    url = j["@odata.nextLink"] ?? "";
  }
  return out;
}

/** Descarga el contenido (WebVTT) de una transcripción (token app-only). */
export async function getTranscriptContent(
  appToken: string,
  userId: string,
  meetingId: string,
  transcriptId: string
): Promise<string> {
  const res = await graph(
    appToken,
    `/users/${userId}/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content?$format=text/vtt`
  );
  if (!res.ok) {
    throw new Error(`Graph transcript content ${res.status}: ${await res.text()}`);
  }
  return res.text();
}

/** Mueve un item a la carpeta destino (por id). Renombra si hay colisión. */
export async function moveItem(
  accessToken: string,
  itemId: string,
  destFolderId: string
): Promise<void> {
  const res = await graph(accessToken, `/me/drive/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentReference: { id: destFolderId },
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });
  if (!res.ok) throw new Error(`Graph move ${res.status}: ${await res.text()}`);
}
