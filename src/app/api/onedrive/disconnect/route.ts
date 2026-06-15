// POST /api/onedrive/disconnect — olvida el token de un ámbito { scope }.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { disconnect, connKey } from "@/lib/connections";

export const runtime = "nodejs";

const bodySchema = z.object({ scope: z.enum(["company", "personal"]) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { scope: kind } = bodySchema.parse(await req.json());
    if (kind === "company" && user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Solo el superadmin desconecta la carpeta empresarial." },
        { status: 403 }
      );
    }
    await disconnect(connKey(user.company_id, user.id, kind));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      NextResponse.json({ error: String(err) }, { status: 400 })
    );
  }
}
