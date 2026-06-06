// GET  /api/admin/users — lista usuarios de la empresa (solo superadmin).
// POST /api/admin/users — da de alta un usuario por email (solo superadmin).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import { listUsers, createUser } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await requireSuperadmin();
    const users = await listUsers(admin.company_id);
    return NextResponse.json({ users });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      NextResponse.json({ error: String(err) }, { status: 500 })
    );
  }
}

const createSchema = z.object({
  email: z.string().email("Email inválido"),
  name: z.string().trim().optional(),
  role: z.enum(["superadmin", "member"]).default("member"),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperadmin();
    const body = createSchema.parse(await req.json());
    const user = await createUser(
      admin.company_id,
      body.email,
      body.name,
      body.role
    );
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("users_email_key") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { ok: false, error: "Ese email ya está registrado." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
