// Extracción de texto plano de archivos para subida web e importación masiva.
// Soporta Markdown/texto directo, .docx (mammoth) y .pdf (pdf-parse v1).
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractRawText } from "mammoth";
// Importamos el subpath interno para evitar el bloque "debug" de pdf-parse v1
// que intenta leer un PDF de prueba cuando se carga sin module.parent.
import pdf from "pdf-parse/lib/pdf-parse.js";

export const SUPPORTED_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".docx",
  ".pdf",
  ".vtt", // transcripciones (Teams, WebVTT)
];

export function isSupported(file: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

/**
 * Convierte una transcripción WebVTT (.vtt) en texto legible "Hablante: frase".
 * Quita la cabecera WEBVTT, los identificadores de cue y las marcas de tiempo,
 * y desenvuelve las etiquetas de voz <v Nombre>…</v> de Teams.
 */
export function parseVtt(raw: string): string {
  const body = raw.replace(/^﻿/, "").replace(/^WEBVTT[^\n]*\n/, "");
  const blocks = body.split(/\r?\n\r?\n/);
  const out: string[] = [];
  let lastSpeaker = "";
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const tsIdx = lines.findIndex((l) => l.includes("-->"));
    if (tsIdx === -1) continue; // bloque sin marca de tiempo (cabecera/NOTE)
    const payload = lines.slice(tsIdx + 1).join(" ").trim();
    if (!payload) continue;
    const voice = payload.match(/<v\s+([^>]+)>([\s\S]*?)<\/v>/);
    if (voice) {
      const speaker = voice[1].trim();
      const text = voice[2].replace(/<[^>]+>/g, "").trim();
      if (!text) continue;
      // No repetir el nombre si el mismo hablante sigue hablando.
      out.push(speaker === lastSpeaker ? text : `${speaker}: ${text}`);
      lastSpeaker = speaker;
    } else {
      const text = payload.replace(/<[^>]+>/g, "").trim();
      if (text) out.push(text);
      lastSpeaker = "";
    }
  }
  return out.join("\n").trim();
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
    case ".vtt":
      return parseVtt(data.toString("utf8"));
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
