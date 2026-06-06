// GET  /api/onedrive/status  — estado de la conexión (sin exponer el token).
// POST /api/onedrive/status  — actualiza la carpeta a vigilar { folder }.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOneDrive, setOneDrive } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const s = await getOneDrive();
  return NextResponse.json({
    connected: Boolean(s.refreshToken),
    account: s.account ?? "",
    folder: s.folder,
    lastSync: s.lastSync ?? null,
    configured: true,
  });
}

const bodySchema = z.object({ folder: z.string().trim().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const { folder } = bodySchema.parse(await req.json());
    // Normaliza: sin barras al inicio/fin.
    const clean = folder.replace(/^\/+|\/+$/g, "");
    const s = await setOneDrive({ folder: clean });
    return NextResponse.json({ ok: true, folder: s.folder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
