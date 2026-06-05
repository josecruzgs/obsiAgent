// Embeddings con Voyage AI (recomendado por Anthropic para usar junto a Claude).
// Claude no expone API de embeddings; por eso usamos Voyage aquí.
import { env } from "./env";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

type InputType = "document" | "query";

async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.voyageApiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: env.voyageModel,
      input_type: inputType,
      output_dimension: env.voyageDim,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${detail}`);
  }

  const json = (await res.json()) as VoyageResponse;
  // Ordena por index por si la API no respeta el orden de entrada.
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/** Embedding de un documento que vamos a indexar. Trunca a un tamaño razonable. */
export async function embedDocument(text: string): Promise<number[]> {
  const trimmed = text.slice(0, 32000);
  const [vec] = await embed([trimmed], "document");
  return vec;
}

/** Embedding de una consulta de búsqueda. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text.slice(0, 8000)], "query");
  return vec;
}
