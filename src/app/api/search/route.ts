// POST /api/search — pregunta en lenguaje natural -> respuesta RAG con fuentes.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAssistant } from "@/lib/agents/assistant";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";

export const runtime = "nodejs";

const bodySchema = z.object({
  q: z.string().min(1, "La consulta no puede estar vacía"),
  k: z.number().int().min(1).max(20).optional(), // aceptado por compatibilidad; el agente decide
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { q } = bodySchema.parse(await req.json());
    const result = await runAssistant(q, user);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    console.error("[search] error:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
