// GET /api/graph — nodos y aristas del grafo de conocimiento.
import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/graph";

export const runtime = "nodejs";

export async function GET() {
  try {
    const graph = await buildGraph();
    return NextResponse.json({ ok: true, ...graph });
  } catch (err) {
    console.error("[graph] error:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
