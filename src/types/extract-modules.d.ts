// Declaraciones mínimas para librerías sin tipos propios usadas en la
// extracción de texto (importación masiva).

declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
  }
  function pdf(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdf;
}

declare module "mammoth" {
  export function extractRawText(
    input: { path: string } | { buffer: Buffer }
  ): Promise<{ value: string; messages: unknown[] }>;
}
