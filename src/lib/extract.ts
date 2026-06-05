// Extracción de texto plano de archivos para subida web e importación masiva.
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

/** Extrae texto a partir de un buffer en memoria (subida web). */
export async function extractTextFromBuffer(
  filename: string,
  data: Buffer
): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".md":
    case ".markdown":
    case ".txt":
      return data.toString("utf8").trim();
    case ".docx": {
      const { value } = await extractRawText({ buffer: data });
      return value.trim();
    }
    case ".pdf": {
      const parsed = await pdf(data);
      return (parsed.text || "").trim();
    }
    default:
      throw new Error(`Formato no soportado: ${ext}`);
  }
}

/** Extrae texto de un archivo en disco (importación masiva desde el inbox). */
export async function extractText(filePath: string): Promise<string> {
  return extractTextFromBuffer(filePath, await fs.readFile(filePath));
}
