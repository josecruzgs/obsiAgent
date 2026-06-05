// POST /api/search — pregunta en lenguaje natural -> respuesta RAG con fuentes.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { answer } from "@/lib/rag";

export const runtime = "nodejs";

const bodySchema = z.object({
  q: z.string().min(1, "La consulta no puede estar vacía"),
  k: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { q, k } = bodySchema.parse(await req.json());
    const result = await answer(q, k ?? 5);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[search] error:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
