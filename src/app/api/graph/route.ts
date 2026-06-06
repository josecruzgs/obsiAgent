// GET /api/graph — nodos y aristas del grafo de conocimiento.
import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/graph";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const graph = await buildGraph(user);
    return NextResponse.json({ ok: true, ...graph });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    console.error("[graph] error:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
