// Bitácora del vault (patrón "log.md" de la LLM Wiki de Karpathy): un registro
// cronológico, append-only, de lo que pasa en cada ámbito (ingestas, consultas,
// mantenimiento). NO llama a Claude ni a Voyage: solo escribe texto → costo cero.
//
// Se guarda como nota de sistema "_log" (o "_log-user-<id>"): igual que el MOC,
// NO se indexa con embedding ni aparece en /graph ni en el índice. Cada entrada
// empieza con un prefijo consistente `## [fecha] op | detalle`, así el log es
// parseable con herramientas simples (p. ej. grep "^## \[").
import { readNote, writeNote } from "./vault";
import { scopeSubdir, logId, type Scope } from "./scope";

export type LogOp = "ingest" | "update" | "query" | "lint";

/** Marca de tiempo "YYYY-MM-DD HH:MM" (local del servidor, UTC en el VPS). */
function stamp(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Añade una entrada a la bitácora del ámbito. Best-effort: si falla, NO rompe el
 * flujo que la llamó (solo loguea el error en consola). La entrada nueva se
 * agrega al FINAL (más reciente abajo → `grep ... | tail -N` da las últimas N).
 */
export async function appendLog(
  scope: Scope,
  op: LogOp,
  detail: string
): Promise<void> {
  try {
    const subdir = scopeSubdir(scope);
    const id = logId(scope);
    const prev = await readNote(id, subdir);
    const now = new Date();

    const clean = detail.replace(/\s+/g, " ").trim();
    const line = `## [${stamp(now)}] ${op} | ${clean}`;
    const body = prev?.body ? `${prev.body}\n\n${line}` : line;

    await writeNote({
      id,
      subdir,
      frontmatter: {
        title: "Bitácora del vault",
        summary:
          "Registro cronológico de ingestas, consultas y mantenimiento (append-only).",
        tags: ["log"],
        created:
          (prev?.frontmatter.created as string | undefined) ?? now.toISOString(),
        updated: now.toISOString(),
      },
      body,
    });
  } catch (e) {
    console.error("[log] no se pudo escribir la bitácora:", e);
  }
}
