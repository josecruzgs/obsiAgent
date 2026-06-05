// Extracción de texto plano de archivos para la importación masiva.
// Soporta Markdown/texto directo, .docx (mammoth) y .pdf (pdf-parse v1).
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractRawText } from "mammoth";
// Importamos el subpath interno para evitar el bloque "debug" de pdf-parse v1
// que intenta leer un PDF de prueba cuando se carga sin module.parent.
import pdf from "pdf-parse/lib/pdf-parse.js";

export const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt", ".docx", ".pdf"];

export function isSupported(file: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

/** Devuelve el texto plano de un archivo. Lanza si el formato no se soporta. */
export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".markdown":
    case ".txt":
      return (await fs.readFile(filePath, "utf8")).trim();
    case ".docx": {
      const { value } = await extractRawText({ path: filePath });
      return value.trim();
    }
    case ".pdf": {
      const data = await fs.readFile(filePath);
      const parsed = await pdf(data);
      return (parsed.text || "").trim();
    }
    default:
      throw new Error(`Formato no soportado: ${ext}`);
  }
}
