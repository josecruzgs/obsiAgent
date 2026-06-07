// POST /api/ingest-transcript — ingesta de una transcripción (p.ej. de Teams vía
// Power Automate) directo a la base EMPRESARIAL. Endpoint de máquina: protegido
// por token (BULK_IMPORT_TOKEN), sin sesión.
//
// Body JSON:
//   {
//     "transcript": "WEBVTT...  o texto plano",   // requerido
//     "title": "Reunión equipo Q2",                // opcional (sugerencia de título)
//     "meeting": {                                  // opcional (metadatos)
//        "subject": "...", "start": "...", "end": "...",
//        "organizer": "...", "attendees": ["a@x.com", "b@x.com"]
//     }
//   }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isImportAuthorized } from "@/lib/importAuth";
import { parseVtt } from "@/lib/extract";
import { getBootstrapCompany } from "@/lib/tenancy";
import { companyScope } from "@/lib/scope";
import { loadIngestContext, ingestText } from "@/lib/ingest";
import { rebuildMoc } from "@/lib/moc";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  transcript: z.string().min(1, "transcript vacío"),
  title: z.string().optional(),
  externalId: z.string().optional(), // id de la transcripción (idempotencia)
  meeting: z
    .object({
      subject: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      organizer: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  if (!isImportAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado: falta o no coincide el token." },
      { status: 401 }
    );
  }

  try {
    // Acepta dos formatos:
    //  - application/json: { transcript, title?, meeting? }  (curl/pruebas)
    //  - cualquier otro:   el cuerpo crudo ES la transcripción; el título va en
    //    el header "x-title" o ?title=  (más fácil para Power Automate: sin JSON).
    const url = new URL(req.url);
    const ct = req.headers.get("content-type") || "";
    let transcript: string;
    let title: string | undefined;
    let externalId: string | undefined;
    let meeting: z.infer<typeof bodySchema>["meeting"];

    if (ct.includes("application/json")) {
      ({ transcript, title, externalId, meeting } = bodySchema.parse(
        await req.json()
      ));
    } else {
      transcript = await req.text();
      title =
        req.headers.get("x-title") ||
        url.searchParams.get("title") ||
        undefined;
      const subject = req.headers.get("x-subject") || undefined;
      const start = req.headers.get("x-start") || undefined;
      const organizer = req.headers.get("x-organizer") || undefined;
      meeting = subject || start || organizer ? { subject, start, organizer } : undefined;
      if (!transcript?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Cuerpo vacío (se esperaba la transcripción)." },
          { status: 400 }
        );
      }
    }
    externalId =
      externalId ||
      req.headers.get("x-external-id") ||
      url.searchParams.get("externalId") ||
      undefined;

    // Idempotencia: si ya ingerimos esta transcripción, no la dupliques.
    if (externalId) {
      const [dup] = await query<{ id: string }>(
        `select id from notes where external_id = $1`,
        [externalId]
      );
      if (dup) {
        return NextResponse.json({ ok: true, skipped: true, id: dup.id });
      }
    }

    // Si viene en formato WebVTT, lo limpiamos a "Hablante: frase".
    const looksVtt = /-->/.test(transcript);
    const text = looksVtt ? parseVtt(transcript) : transcript.trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "La transcripción quedó vacía tras procesarla." },
        { status: 400 }
      );
    }

    // Encabezado con metadatos de la reunión (da contexto a Claude).
    const meta: string[] = [];
    if (meeting?.subject) meta.push(`Reunión: ${meeting.subject}`);
    if (meeting?.start) meta.push(`Fecha: ${meeting.start}`);
    if (meeting?.organizer) meta.push(`Organizador: ${meeting.organizer}`);
    if (meeting?.attendees?.length)
      meta.push(`Asistentes: ${meeting.attendees.join(", ")}`);
    const body = meta.length ? `${meta.join("\n")}\n\n---\n\n${text}` : text;

    const company = await getBootstrapCompany();
    const scope = companyScope(company.id);
    const ctx = await loadIngestContext(scope);

    const hint = title || meeting?.subject || "Transcripción de reunión";
    const r = await ingestText(body, hint, ctx, {
      source: "teams",
      tipo: "transcripcion",
    });

    // Marca la nota con el id externo para la idempotencia del sondeo.
    if (externalId) {
      await query(`update notes set external_id = $1 where id = $2`, [
        externalId,
        r.id,
      ]).catch((e) => console.error("[ingest-transcript] external_id:", e));
    }

    await rebuildMoc(scope).catch((e) =>
      console.error("[ingest-transcript] rebuildMoc:", e)
    );

    return NextResponse.json({
      ok: true,
      id: r.id,
      title: r.title,
      summary: r.summary,
      tags: r.tags,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[ingest-transcript] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
