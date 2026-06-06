// DELETE /api/admin/users/[id] — elimina un usuario (solo superadmin).
// PATCH  /api/admin/users/[id] — cambia el rol (solo superadmin).
// Candados: no eliminarte/degradarte a ti mismo dejando la empresa sin superadmin.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/currentUser";
import { authErrorResponse } from "@/lib/adminAuth";
import {
  getUserById,
  deleteUser,
  setUserRole,
  countSuperadmins,
} from "@/lib/tenancy";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireSuperadmin();
    const { id } = await params;
    const target = await getUserById(id);
    if (!target || target.company_id !== admin.company_id) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (target.id === admin.id) {
      return NextResponse.json(
        { error: "No puedes eliminarte a ti mismo." },
        { status: 400 }
      );
    }
    if (target.role === "superadmin" && (await countSuperadmins(admin.company_id)) <= 1) {
      return NextResponse.json(
        { error: "No puedes eliminar al único superadmin." },
        { status: 400 }
      );
    }
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      NextResponse.json({ error: String(err) }, { status: 500 })
    );
  }
}

const patchSchema = z.object({ role: z.enum(["superadmin", "member"]) });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireSuperadmin();
    const { id } = await params;
    const { role } = patchSchema.parse(await req.json());

    const target = await getUserById(id);
    if (!target || target.company_id !== admin.company_id) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    // No degradar al último superadmin (te dejaría sin acceso de admin).
    if (
      target.role === "superadmin" &&
      role === "member" &&
      (await countSuperadmins(admin.company_id)) <= 1
    ) {
      return NextResponse.json(
        { error: "Debe quedar al menos un superadmin." },
        { status: 400 }
      );
    }
    await setUserRole(id, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const a = authErrorResponse(err);
    if (a) return a;
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
