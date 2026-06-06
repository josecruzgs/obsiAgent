// POST /api/onedrive/disconnect — olvida el token de un ámbito { scope }.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { disconnect } from "@/lib/connections";
import { companyScope, personalScope } from "@/lib/scope";

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
    await disconnect(
      kind === "company"
        ? companyScope(user.company_id)
        : personalScope(user.company_id, user.id)
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      NextResponse.json({ error: String(err) }, { status: 400 })
    );
  }
}
