// Cliente mínimo de Microsoft Graph para OneDrive: OAuth (authorization code +
// refresh) y operaciones de archivos (listar carpeta, descargar, crear carpeta,
// mover). La persistencia/rotación del refresh_token vive en `connections` (DB).
import { Unzip, UnzipInflate } from "fflate";
import { env } from "./env";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

// offline_access -> refresh_token; Files.ReadWrite -> archivos; openid/profile ->
// id_token (de ahí sacamos tenant id + user id para Teams app-only por-tenant).
const SCOPES_BASIC = "openid profile offline_access User.Read Files.ReadWrite";
// Solo la conexión EMPRESARIAL (M365) pide además: leer transcripciones de Teams
// y leer sitios de SharePoint (bibliotecas de documentos del equipo, solo lectura).
// (Las cuentas personales outlook.com no soportan estos permisos.)
const SCOPES_FULL =
  SCOPES_BASIC +
  " OnlineMeetings.Read OnlineMeetingTranscript.Read.All Sites.Read.All";

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
  id_token?: string;
  expires_in: number;
}

/** Extrae tenant id (tid) y user id (oid) del id_token de una respuesta OAuth. */
export function identityFromToken(tok: TokenResponse): {
  tenantId?: string;
  userId?: string;
} {
  if (!tok.id_token) return {};
  try {
    const part = tok.id_token.split(".")[1];
    const pad = part.length % 4 ? "=".repeat(4 - (part.length % 4)) : "";
    const claims = JSON.parse(
      Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8")
    ) as { tid?: string; oid?: string };
    return { tenantId: claims.tid, userId: claims.oid };
  } catch {
    return {};
  }
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

/** Access token para un recurso arbitrario (p. ej. SharePoint/OneDrive REST o
 *  Graph con `.default`) vía refresh token. NO incluye `redirect_uri` (no hace
 *  falta en el grant refresh_token y evita AADSTS50011 en entornos locales).
 *  `scope` típico: `https://{host}/.default`. */
export async function tokenForScope(
  refreshToken: string,
  scope: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope,
  });
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`OAuth token ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
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

// ─── SharePoint: resolver sitio + biblioteca de documentos (drive) ──────────

export interface SharePointDrive {
  siteId: string;
  siteName: string;
  driveId: string;
  driveName: string;
}

/**
 * Resuelve una URL de sitio de SharePoint (p. ej.
 * `https://contoso.sharepoint.com/sites/Equipo`) a su biblioteca de documentos
 * por defecto, devolviendo los ids necesarios para listar/descargar archivos.
 * Requiere el permiso `Sites.Read.All`.
 */
export async function resolveSharePointDrive(
  accessToken: string,
  siteUrl: string
): Promise<SharePointDrive> {
  let host: string;
  let path: string;
  try {
    const u = new URL(siteUrl.trim());
    host = u.host;
    path = u.pathname.replace(/\/+$/, ""); // p. ej. /sites/Equipo  (o "" si raíz)
  } catch {
    throw new Error("URL de SharePoint inválida.");
  }

  // /sites/{host}:/{server-relative-path}  (sin path = sitio raíz del host)
  const siteEndpoint = path ? `/sites/${host}:${path}` : `/sites/${host}`;
  const siteRes = await graph(accessToken, `${siteEndpoint}?$select=id,displayName,name`);
  if (siteRes.status === 403) {
    throw new Error(
      "Sin permiso para leer SharePoint (falta consentir Sites.Read.All en Entra y reconectar)."
    );
  }
  if (!siteRes.ok) {
    throw new Error(`No se encontró el sitio (${siteRes.status}). Revisa la URL.`);
  }
  const site = (await siteRes.json()) as { id: string; displayName?: string; name?: string };

  const driveRes = await graph(accessToken, `/sites/${site.id}/drive?$select=id,name`);
  if (!driveRes.ok) {
    throw new Error(`No se pudo abrir la biblioteca del sitio (${driveRes.status}).`);
  }
  const drive = (await driveRes.json()) as { id: string; name?: string };

  return {
    siteId: site.id,
    siteName: site.displayName || site.name || path || host,
    driveId: drive.id,
    driveName: drive.name || "Documentos",
  };
}

export interface DriveFile {
  id: string;
  name: string;
  lastModified?: string; // lastModifiedDateTime (para detectar cambios y re-ingerir)
}

/**
 * Lista los archivos soportados del primer nivel de `folder` (ignora subcarpetas
 * como procesados/fallidos). Devuelve [] si la carpeta no existe todavía.
 * `driveBase` permite apuntar a otro drive (p. ej. `/drives/{id}` de SharePoint);
 * por defecto el OneDrive del usuario (`/me/drive`).
 */
export async function listFolderFiles(
  accessToken: string,
  folder: string,
  driveBase = "/me/drive"
): Promise<DriveFile[]> {
  // Carpeta vacía = raíz del drive (lista todo el primer nivel).
  const base = folder
    ? `${GRAPH}${driveBase}/root:/${encPath(folder)}:/children`
    : `${GRAPH}${driveBase}/root/children`;
  let url = `${base}?$select=id,name,folder,file,lastModifiedDateTime&$top=200`;
  const out: DriveFile[] = [];
  while (url) {
    const res = await graph(accessToken, url);
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Graph list ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as {
      value?: Array<{
        id: string;
        name: string;
        folder?: unknown;
        lastModifiedDateTime?: string;
      }>;
      "@odata.nextLink"?: string;
    };
    for (const it of j.value ?? []) {
      if (it.folder) continue; // subcarpetas (procesados/fallidos) se ignoran
      const dot = it.name.lastIndexOf(".");
      const ext = dot >= 0 ? it.name.slice(dot).toLowerCase() : "";
      if (SUPPORTED.includes(ext))
        out.push({ id: it.id, name: it.name, lastModified: it.lastModifiedDateTime });
    }
    url = j["@odata.nextLink"] ?? "";
  }
  return out;
}

export async function downloadFile(
  accessToken: string,
  id: string,
  driveBase = "/me/drive"
): Promise<Buffer> {
  const res = await graph(accessToken, `${driveBase}/items/${id}/content`);
  if (!res.ok) throw new Error(`Graph download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Crea (si no existe) la subcarpeta `name` dentro de `parent` y devuelve su id. */
export async function ensureFolder(
  accessToken: string,
  parent: string,
  name: string,
  driveBase = "/me/drive"
): Promise<string> {
  const full = `${parent}/${name}`;
  const get = await graph(accessToken, `${driveBase}/root:/${encPath(full)}`);
  if (get.ok) return ((await get.json()) as { id: string }).id;

  const res = await graph(
    accessToken,
    `${driveBase}/root:/${encPath(parent)}:/children`,
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
    const g2 = await graph(accessToken, `${driveBase}/root:/${encPath(full)}`);
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

/** Token app-only (client_credentials) para Microsoft Graph en un tenant dado. */
export async function getAppToken(tenantId: string): Promise<string> {
  if (!tenantId) throw new Error("Falta el tenant de la conexión.");
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) throw new Error(`App token ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Lista todas las transcripciones de reuniones organizadas por `userId`.
 *  Se pasa una ventana de fechas explícita (por defecto, último año). */
export async function getAllTranscripts(
  appToken: string,
  userId: string,
  startDateTime?: string,
  endDateTime?: string
): Promise<MeetingTranscript[]> {
  const start =
    startDateTime ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const end = endDateTime ?? new Date().toISOString();
  let url =
    `${GRAPH}/users/${userId}/onlineMeetings/getAllTranscripts` +
    `(meetingOrganizerUserId='${userId}',startDateTime=${start},endDateTime=${end})?$top=50`;
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

// ─── Grabaciones de Teams en OneDrive (Camino: leer el transcript embebido) ──
// Las reuniones organizadas por terceros (otros tenants) no se alcanzan con
// getAllTranscripts, pero su grabación cae en el OneDrive de quien graba. El
// .mp4 lleva la transcripción como "alternate content stream"; se descarga el
// archivo con todas sus streams (API REST de SharePoint) y se extrae el JSON
// de transcripción de Stream sin bufferizar el video en memoria.

export interface RecordingItem {
  id: string;
  name: string;
  webUrl: string;
  siteUrl: string; // colección de sitio para las llamadas _api
  serverRelativeUrl: string; // ruta del archivo dentro del sitio
  host: string; // p. ej. iagent369-my.sharepoint.com
  createdDateTime?: string;
  size?: number;
}

/** Lista los .mp4 de una carpeta de grabaciones (token delegado de Graph).
 *  Devuelve [] si la carpeta no existe. */
export async function listRecordings(
  graphToken: string,
  folder: string
): Promise<RecordingItem[]> {
  const url =
    `${GRAPH}/me/drive/root:/${encPath(folder)}:/children` +
    `?$select=id,name,size,webUrl,file,createdDateTime,sharepointIds&$top=200`;
  const out: RecordingItem[] = [];
  let next = url;
  while (next) {
    const res = await graph(graphToken, next);
    if (res.status === 404) return out;
    if (!res.ok) {
      throw new Error(`Graph children ${res.status}: ${await res.text()}`);
    }
    const j = (await res.json()) as {
      value?: Array<{
        id: string;
        name: string;
        size?: number;
        webUrl?: string;
        createdDateTime?: string;
        file?: { mimeType?: string };
        sharepointIds?: { siteUrl?: string };
      }>;
      "@odata.nextLink"?: string;
    };
    for (const c of j.value ?? []) {
      if (!c.file || !/\.mp4$/i.test(c.name) || !c.webUrl) continue;
      let host = "";
      let serverRelativeUrl = "";
      try {
        const u = new URL(c.webUrl);
        host = u.host;
        serverRelativeUrl = decodeURIComponent(u.pathname);
      } catch {
        continue;
      }
      out.push({
        id: c.id,
        name: c.name,
        webUrl: c.webUrl,
        host,
        serverRelativeUrl,
        siteUrl: c.sharepointIds?.siteUrl || `https://${host}`,
        createdDateTime: c.createdDateTime,
        size: c.size,
      });
    }
    next = j["@odata.nextLink"] ?? "";
  }
  return out;
}

/** ¿La grabación trae alternate content streams (transcripción embebida)?
 *  Chequeo barato (sin descargar el video) para no bajar archivos sin transcript. */
export async function hasAlternateContentStreams(
  spToken: string,
  siteUrl: string,
  serverRelativeUrl: string
): Promise<boolean> {
  const apiUrl =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl(` +
    `'${serverRelativeUrl.replace(/'/g, "''")}')/HasAlternateContentStreams`;
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${spToken}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (!res.ok) {
    throw new Error(`SharePoint HasAltStreams ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as { value?: boolean };
  return j.value === true;
}

/** Descarga una grabación con sus alternate streams (zip de la API de migración
 *  de SharePoint) y extrae SOLO el JSON de transcripción de Stream, en streaming
 *  (no acumula el video). Devuelve el texto crudo del JSON, o null si no hay. */
export async function getRecordingTranscript(
  spToken: string,
  siteUrl: string,
  serverRelativeUrl: string
): Promise<string | null> {
  const dlUrl =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl(` +
    `'${serverRelativeUrl.replace(/'/g, "''")}')` +
    `/OpenBinaryStreamWithOptions(openOptions=1048576)`; // GetAsZipWithAltStreams
  const res = await fetch(dlUrl, { headers: { Authorization: `Bearer ${spToken}` } });
  if (!res.ok || !res.body) {
    const detail = res.ok ? "sin cuerpo" : (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`SharePoint download ${res.status}: ${detail}`);
  }

  const dec = new TextDecoder();
  const small: Uint8Array[][] = []; // streams chicas candidatas (texto/JSON)

  return await new Promise<string | null>((resolve, reject) => {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    let pending = 0;
    let streamDone = false;
    const tryResolve = () => {
      if (!streamDone || pending > 0) return;
      for (const parts of small) {
        const text = dec.decode(concatChunks(parts));
        if (text.includes("transcript.json") || /"type"\s*:\s*"Transcript"/.test(text)) {
          resolve(text);
          return;
        }
      }
      resolve(null);
    };

    unzip.onfile = (file) => {
      // El stream primario (video) puede ser enorme: lo procesamos pero NO lo
      // acumulamos. Solo guardamos streams pequeñas (la transcripción ~KB).
      const isPrimary = /Primary$/i.test(file.name);
      const parts: Uint8Array[] = [];
      let bytes = 0;
      const MAX_TEXT = 5 * 1024 * 1024; // descarta cualquier stream "chica" >5MB
      let keep = !isPrimary;
      pending++;
      file.ondata = (err, chunk, final) => {
        if (err) {
          reject(err);
          return;
        }
        if (keep && chunk) {
          bytes += chunk.length;
          if (bytes > MAX_TEXT) {
            keep = false;
            parts.length = 0;
          } else {
            parts.push(chunk);
          }
        }
        if (final) {
          if (keep && parts.length) small.push(parts);
          pending--;
          tryResolve();
        }
      };
      file.start();
    };

    const reader = res.body!.getReader();
    const pump = (): Promise<void> =>
      reader.read().then(({ done, value }) => {
        if (done) {
          unzip.push(new Uint8Array(0), true);
          streamDone = true;
          tryResolve();
          return;
        }
        unzip.push(value, false);
        return pump();
      });
    pump().catch(reject);
  });
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Mueve un item a la carpeta destino (por id). Renombra si hay colisión. */
export async function moveItem(
  accessToken: string,
  itemId: string,
  destFolderId: string,
  driveBase = "/me/drive"
): Promise<void> {
  const res = await graph(accessToken, `${driveBase}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentReference: { id: destFolderId },
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });
  if (!res.ok) throw new Error(`Graph move ${res.status}: ${await res.text()}`);
}
