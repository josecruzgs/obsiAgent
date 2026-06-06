// POST /api/reindex — reindexa todas las notas .md del vault (embedding + enlaces),
// sin pasar por Claude. Útil si editaste/copiaste notas directamente en el vault.
//
// Protegido por token (igual que /api/bulk-import). Ej.:
//   curl -X POST "http://127.0.0.1:3001/api/reindex?token=XXXX"
import { NextRequest, NextResponse } from "next/server";
import { isImportAuthorized } from "@/lib/importAuth";
import { readAllNotes } from "@/lib/vault";
import { indexNote } from "@/lib/indexer";
import { rebuildMoc } from "@/lib/moc";
import { getBootstrapCompany, listUsers } from "@/lib/tenancy";
import { companyScope, personalScope, scopeSubdir, type Scope } from "@/lib/scope";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isImportAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado: falta o no coincide el token." },
      { status: 401 }
    );
  }

  const company = await getBootstrapCompany();
  // Ámbitos a reindexar: empresarial (raíz) + el personal de cada usuario.
  const scopes: Scope[] = [companyScope(company.id)];
  for (const u of await listUsers(company.id)) {
    scopes.push(personalScope(company.id, u.id));
  }

  let indexadas = 0;
  let total = 0;
  const errores: { id: string; error: string }[] = [];

  for (const scope of scopes) {
    const notes = await readAllNotes(scopeSubdir(scope));
    total += notes.length;
    for (const note of notes) {
      try {
        await indexNote(note, scope);
        indexadas++;
      } catch (err) {
        errores.push({
          id: note.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await rebuildMoc(scope).catch((e) => console.error("[reindex] rebuildMoc:", e));
  }

  return NextResponse.json({ ok: true, total, indexadas, errores });
}
