// GET /api/onedrive/callback — recibe el `code` de Microsoft, lo intercambia por
// tokens, guarda el refresh_token y vuelve a /config.
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { exchangeCode, getAccount } from "@/lib/onedrive";
import { setOneDrive } from "@/lib/settings";

export const runtime = "nodejs";

function back(params: string): NextResponse {
  return NextResponse.redirect(`${env.publicBaseUrl}/config?${params}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookieState = req.cookies.get("od_state")?.value;

  if (oauthError) return back(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state || state !== cookieState) {
    return back("error=estado_invalido");
  }

  try {
    const tok = await exchangeCode(code);
    if (!tok.refresh_token) {
      throw new Error(
        "Microsoft no devolvió refresh_token (revisa el scope offline_access)."
      );
    }
    const account = await getAccount(tok.access_token).catch(() => "");
    await setOneDrive({ refreshToken: tok.refresh_token, account });

    const res = back("connected=1");
    res.cookies.delete("od_state");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return back(`error=${encodeURIComponent(msg)}`);
  }
}
