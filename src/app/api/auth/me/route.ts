// GET /api/auth/me — datos del usuario autenticado (para la UI). 401 si no hay sesión.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getCompany } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const company = await getCompany(user.company_id);
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    company: company ? { id: company.id, name: company.name } : null,
  });
}
