// POST /api/onedrive/disconnect — olvida el token y la cuenta (mantiene la carpeta).
import { NextResponse } from "next/server";
import { getOneDrive, setOneDrive } from "@/lib/settings";

export const runtime = "nodejs";

export async function POST() {
  const s = await getOneDrive();
  // Conserva la carpeta elegida; solo borra credenciales y último sync.
  await setOneDrive({
    refreshToken: undefined,
    account: undefined,
    lastSync: undefined,
    folder: s.folder,
  });
  return NextResponse.json({ ok: true });
}
