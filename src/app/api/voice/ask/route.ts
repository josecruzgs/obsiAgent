// POST /api/voice/ask — endpoint para un agente de voz telefónico (Retell AI).
// Retell maneja la llamada (STT/TTS/turnos) y llama aquí como "function/tool"
// para responder desde la base de conocimiento. Auth por token (?token= o header
// x-import-token = BULK_IMPORT_TOKEN). Responde de la base EMPRESARIAL.
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { getBootstrapCompany, getBootstrapOwner, type User } from "@/lib/tenancy";
import { runAssistant } from "@/lib/agents/assistant";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_USER = "00000000-0000-0000-0000-000000000000";

// Extrae la consulta de las distintas formas en que un proveedor de voz
// (Retell, etc.) puede mandar los argumentos de la función.
function extractQuery(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  const args = (b.args ?? b.parameters ?? b.arguments ?? {}) as Record<string, unknown>;
  const q =
    b.query ?? b.question ?? b.text ?? args.query ?? args.question ?? args.text ?? "";
  return String(q ?? "").trim();
}

export async function POST(req: NextRequest) {
  if (!isImportAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* cuerpo vacío o no JSON */
  }
  const query = extractQuery(body);
  if (!query) {
    return NextResponse.json(
      { ok: false, error: "Falta la consulta (query)." },
      { status: 400 }
    );
  }

  // Busca como el "dueño": ve la base EMPRESARIAL + sus notas PERSONALES.
  const company = await getBootstrapCompany();
  const owner = await getBootstrapOwner();
  const companyUser: User = owner ?? {
    id: NO_USER,
    company_id: company.id,
    email: "",
    name: null,
    role: "member",
    ms_oid: null,
  };

  try {
    const result = await runAssistant(query, companyUser, { label: "voice" });
    // Respuesta simple para que Retell la lea; `answer` es el campo principal.
    return NextResponse.json({ ok: true, answer: result.answer, response: result.answer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
