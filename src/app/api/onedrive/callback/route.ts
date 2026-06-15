// GET /api/onedrive/callback — recibe el code de Microsoft, lo intercambia por
// tokens y guarda la conexión en el ámbito indicado (cookie od_scope).
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { exchangeCode, getAccount, identityFromToken } from "@/lib/onedrive";
import { getCurrentUser } from "@/lib/currentUser";
import { upsertConnection, connKey } from "@/lib/connections";

export const runtime = "nodejs";

function back(params: string): NextResponse {
  return NextResponse.redirect(`${env.publicBaseUrl}/config?${params}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookieState = req.cookies.get("od_state")?.value;
  const scopeKind = req.cookies.get("od_scope")?.value === "company" ? "company" : "personal";

  if (oauthError) return back(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state || state !== cookieState) {
    return back("error=estado_invalido");
  }

  const user = await getCurrentUser();
  if (!user) return back("error=sesion_expirada");
  if (scopeKind === "company" && user.role !== "superadmin") {
    return back("error=solo_superadmin_empresarial");
  }

  try {
    const tok = await exchangeCode(code, scopeKind === "company");
    if (!tok.refresh_token) {
      throw new Error("Microsoft no devolvió refresh_token (revisa offline_access).");
    }
    const account = await getAccount(tok.access_token).catch(() => "");
    const { tenantId, userId } = identityFromToken(tok); // tid + oid (para Teams)
    await upsertConnection(connKey(user.company_id, user.id, scopeKind), {
      refresh_token: tok.refresh_token,
      account,
      tenant_id: tenantId ?? null,
      ms_user_id: userId ?? null,
    });

    const res = back("connected=1");
    res.cookies.delete("od_state");
    res.cookies.delete("od_scope");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return back(`error=${encodeURIComponent(msg)}`);
  }
}
