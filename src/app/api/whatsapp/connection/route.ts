// GET/POST /api/whatsapp/connection — estado y vinculación de la instancia de
// Evolution (WhatsApp) desde /config. Solo superadmin.
//   GET  ?qr=1        → estado + QR/pairing code si no está conectada
//   POST {action}     → "create" (crea la instancia con webhook) | "logout"
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { ensureSettingsLoaded } from "@/lib/settings";
import { env } from "@/lib/env";
import {
  createInstance,
  getConnectionState,
  getQrCode,
  logoutInstance,
} from "@/lib/evolution";

export const runtime = "nodejs";

async function statusPayload(withQr: boolean) {
  const st = await getConnectionState();
  let qr: string | null = null;
  let pairingCode: string | null = null;
  if (withQr && (st.state === "close" || st.state === "connecting")) {
    const q = await getQrCode();
    if (q.error) return { ...st, instance: env.evolution.instance, qr, pairingCode, detail: q.error };
    qr = q.base64 ?? null;
    pairingCode = q.pairingCode ?? null;
  }
  return { ...st, instance: env.evolution.instance, qr, pairingCode };
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperadmin();
    await ensureSettingsLoaded();
    const withQr = req.nextUrl.searchParams.get("qr") === "1";
    return NextResponse.json({ ok: true, ...(await statusPayload(withQr)) });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

const bodySchema = z.object({ action: z.enum(["create", "logout"]) });

export async function POST(req: NextRequest) {
  try {
    await requireSuperadmin();
    await ensureSettingsLoaded();
    const { action } = bodySchema.parse(await req.json());

    if (action === "create") {
      const webhookUrl = `${env.publicBaseUrl}/api/whatsapp/webhook`;
      const r = await createInstance(webhookUrl);
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...(await statusPayload(true)) });
    }

    // logout
    const r = await logoutInstance();
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await statusPayload(false)) });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}
