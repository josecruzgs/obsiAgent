// GET /api/teams/debug — DIAGNÓSTICO TEMPORAL (borrar tras depurar).
// Modos:
//   (por defecto) prueba getAllTranscripts (organizador). Distingue:
//       - 200 con value:[]  -> el organizador no coincide / no organizó nada
//       - 403 / 412         -> falta application access policy o permisos app-only
//   ?mode=recon  -> Camino B: lista la carpeta de grabaciones, deriva la URL
//       server-relative del primer .mp4, pide token de SharePoint, comprueba
//       HasAlternateContentStreams y prueba el extractor real en streaming.
// Parámetros:
//   ?scope=company|personal   (por defecto personal; company requiere superadmin)
//   ?org=<GUID|email>         sobrescribe meetingOrganizerUserId para probar
//   ?days=<n>                 ventana hacia atrás en días (por defecto 365)
//   ?folder=<nombre>          carpeta a inspeccionar en modo recon (def. Grabaciones)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getConnection, connKey } from "@/lib/connections";
import { getAppToken, tokenForScope, getRecordingTranscript } from "@/lib/onedrive";
import { parseStreamTranscript } from "@/lib/extract";

export const runtime = "nodejs";

const GRAPH = "https://graph.microsoft.com/v1.0";

interface DriveChild {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: unknown;
  sharepointIds?: { siteUrl?: string };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("scope") === "company" ? "company" : "personal";
  if (kind === "company" && user.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Solo el superadmin puede ver el ámbito empresarial." },
      { status: 403 }
    );
  }

  const key = connKey(user.company_id, user.id, kind);
  const conn = await getConnection(key);
  if (!conn) {
    return NextResponse.json({ ok: false, error: "Sin conexión en esta cuenta.", scope: key });
  }

  const conexion = {
    cuenta_conectada: conn.account,
    tenant_id: conn.tenant_id,
    ms_user_id: conn.ms_user_id,
    elegible_teams: Boolean(conn.refresh_token && conn.tenant_id && conn.ms_user_id),
  };

  // ─── Modo recon: OneDrive + SharePoint alt-stream (Camino B) ───────────────
  if (url.searchParams.get("mode") === "recon") {
    if (!conn.refresh_token) {
      return NextResponse.json({ ok: false, conexion, error: "Sin refresh_token." });
    }
    const folder = url.searchParams.get("folder") || "Grabaciones";

    // 1) Token delegado de Graph para listar la carpeta (sin redirect_uri).
    let graphToken: string;
    try {
      graphToken = (
        await tokenForScope(conn.refresh_token, "https://graph.microsoft.com/.default")
      ).access_token;
    } catch (err) {
      return NextResponse.json({
        ok: false,
        conexion,
        paso: "tokenForScope(graph)",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2) Listar la carpeta de grabaciones (si 404, listar raíz para ubicarla).
    const listUrl =
      `${GRAPH}/me/drive/root:/${encodeURIComponent(folder)}:/children` +
      `?$select=id,name,size,webUrl,file,folder,sharepointIds&$top=50`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    if (!listRes.ok) {
      const rootRes = await fetch(
        `${GRAPH}/me/drive/root/children?$select=id,name,folder&$top=100`,
        { headers: { Authorization: `Bearer ${graphToken}` } }
      );
      const root = rootRes.ok
        ? ((await rootRes.json()) as { value?: { name: string; folder?: unknown }[] })
        : null;
      return NextResponse.json({
        ok: false,
        conexion,
        paso: "listar carpeta",
        carpeta_buscada: folder,
        error: `Graph children ${listRes.status}: ${(await listRes.text()).slice(0, 300)}`,
        raiz_de_onedrive: root?.value?.map((x) => ({
          name: x.name,
          es_carpeta: Boolean(x.folder),
        })),
      });
    }
    const children = ((await listRes.json()) as { value?: DriveChild[] }).value ?? [];
    const mp4s = children.filter((c) => c.file && /\.mp4$/i.test(c.name));
    const archivos = children.map((c) => ({
      name: c.name,
      es_carpeta: Boolean(c.folder),
      size: c.size,
    }));

    if (mp4s.length === 0) {
      return NextResponse.json({
        ok: true,
        conexion,
        carpeta: folder,
        total_items: children.length,
        archivos,
        nota: "No se encontraron .mp4 en esta carpeta.",
      });
    }

    // 3) Para el primer .mp4, derivar site + server-relative URL desde webUrl.
    const target = mp4s[0];
    let host = "";
    let serverRelativeUrl = "";
    try {
      const u = new URL(target.webUrl!);
      host = u.host;
      serverRelativeUrl = decodeURIComponent(u.pathname);
    } catch {
      return NextResponse.json({
        ok: false,
        conexion,
        error: "No se pudo parsear webUrl del .mp4",
        target,
      });
    }
    const siteUrl = target.sharepointIds?.siteUrl || `https://${host}`;

    // 4) Token de SharePoint (recurso distinto a Graph).
    let spToken: string;
    try {
      spToken = (await tokenForScope(conn.refresh_token, `https://${host}/.default`))
        .access_token;
    } catch (err) {
      return NextResponse.json({
        ok: false,
        conexion,
        paso: "tokenForScope(sharepoint)",
        host,
        error: err instanceof Error ? err.message : String(err),
        nota:
          "Probablemente falta agregar un permiso DELEGADO de SharePoint a la app " +
          "en Entra y dar consentimiento de admin.",
      });
    }

    // 5) HasAlternateContentStreams sobre el .mp4.
    const apiUrl =
      `${siteUrl}/_api/web/GetFileByServerRelativeUrl(` +
      `'${serverRelativeUrl.replace(/'/g, "''")}')/HasAlternateContentStreams`;
    const altRes = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${spToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });
    const altText = await altRes.text();
    let altJson: unknown = null;
    try {
      altJson = JSON.parse(altText);
    } catch {
      /* conserva texto */
    }
    const hasAlt =
      altJson && typeof altJson === "object" && "value" in altJson
        ? (altJson as { value?: boolean }).value === true
        : false;

    // 6) Extractor REAL en streaming + parser del JSON de transcripción.
    let extraccion: unknown = null;
    if (hasAlt) {
      try {
        const rawJson = await getRecordingTranscript(spToken, siteUrl, serverRelativeUrl);
        if (!rawJson) {
          extraccion = { encontrado: false, nota: "No se halló stream de transcripción." };
        } else {
          const texto = parseStreamTranscript(rawJson);
          extraccion = {
            encontrado: true,
            json_bytes: rawJson.length,
            texto_caracteres: texto.length,
            texto_preview: texto.slice(0, 800),
          };
        }
      } catch (e) {
        extraccion = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    return NextResponse.json({
      ok: true,
      conexion,
      carpeta: folder,
      total_items: children.length,
      mp4_encontrados: mp4s.length,
      archivos,
      target: { name: target.name, host, siteUrl, serverRelativeUrl },
      sharepoint: {
        status: altRes.status,
        hasAlternateContentStreams: hasAlt,
        body: altJson ?? altText.slice(0, 400),
      },
      extraccion,
    });
  }

  // ─── Modo por defecto: getAllTranscripts (organizador) ─────────────────────
  if (!conn.tenant_id || !conn.ms_user_id) {
    return NextResponse.json({
      ok: true,
      conexion,
      nota: "Falta tenant_id o ms_user_id: reconecta con la cuenta de trabajo (M365).",
    });
  }

  const orgParam = url.searchParams.get("org") || "";
  const days = Number(url.searchParams.get("days") || "365") || 365;
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date().toISOString();

  let appToken: string;
  try {
    appToken = await getAppToken(conn.tenant_id);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      conexion,
      paso: "getAppToken",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Si pasaron un email como ?org=, resolverlo a su GUID (oid) vía Graph.
  let organizer = orgParam || conn.ms_user_id;
  let orgResuelto: { entrada: string; id?: string; upn?: string; error?: string } | null =
    null;
  if (orgParam.includes("@")) {
    const r = await fetch(
      `${GRAPH}/users/${encodeURIComponent(orgParam)}?$select=id,userPrincipalName`,
      { headers: { Authorization: `Bearer ${appToken}` } }
    );
    if (r.ok) {
      const u = (await r.json()) as { id: string; userPrincipalName?: string };
      organizer = u.id;
      orgResuelto = { entrada: orgParam, id: u.id, upn: u.userPrincipalName };
    } else {
      orgResuelto = {
        entrada: orgParam,
        error: `Graph /users ${r.status}: ${(await r.text()).slice(0, 300)}`,
      };
      return NextResponse.json({ ok: false, conexion, organizador_resuelto: orgResuelto });
    }
  }

  const graphUrl =
    `${GRAPH}/users/${organizer}/onlineMeetings/getAllTranscripts` +
    `(meetingOrganizerUserId='${organizer}',startDateTime=${start},endDateTime=${end})?$top=50`;

  const res = await fetch(graphUrl, { headers: { Authorization: `Bearer ${appToken}` } });
  const bodyText = await res.text();
  let bodyJson: unknown = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    /* deja bodyJson en null y conserva bodyText */
  }
  const value =
    bodyJson && typeof bodyJson === "object" && "value" in bodyJson
      ? (bodyJson as { value?: unknown[] }).value
      : undefined;

  return NextResponse.json({
    ok: true,
    conexion,
    consulta: {
      organizador_usado: organizer,
      organizador_resuelto: orgResuelto,
      es_override: Boolean(orgParam),
      ventana_dias: days,
      desde: start,
      hasta: end,
    },
    graph: {
      status: res.status,
      transcripciones_encontradas: Array.isArray(value) ? value.length : null,
      body: bodyJson ?? bodyText.slice(0, 2000),
    },
  });
}
