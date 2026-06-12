// GET/POST /api/settings — claves de API configurables desde /config.
// Solo superadmin. GET devuelve los secretos enmascarados (hint con los últimos
// 4 caracteres); POST guarda en la DB y aplica los overrides al instante
// (valor vacío/null = quitar el override y volver al .env del servidor).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import {
  ensureSettingsLoaded,
  saveSettings,
  settingsStatus,
} from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperadmin();
    await ensureSettingsLoaded();
    return NextResponse.json({ ok: true, keys: await settingsStatus() });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

const bodySchema = z.object({
  values: z.record(z.string().max(2000).nullable()),
});

export async function POST(req: NextRequest) {
  try {
    await requireSuperadmin();
    const { values } = bodySchema.parse(await req.json());
    await saveSettings(values);
    return NextResponse.json({ ok: true, keys: await settingsStatus() });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}
