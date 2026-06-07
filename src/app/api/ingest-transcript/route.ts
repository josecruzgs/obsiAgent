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

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  transcript: z.string().min(1, "transcript vacío"),
  title: z.string().optional(),
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
    const { transcript, title, meeting } = bodySchema.parse(await req.json());

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
