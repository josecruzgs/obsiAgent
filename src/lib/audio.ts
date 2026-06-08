// Audio para WhatsApp con OpenAI: transcripción (Whisper) y voz (TTS).
// Claude/Anthropic no hace audio; por eso se usa OpenAI vía HTTP directo.
import { env } from "./env";

/** Voz → texto (Whisper). `data` es el audio crudo (ogg/opus de WhatsApp). */
export async function transcribeAudio(data: Buffer, mimetype = "audio/ogg"): Promise<string> {
  const { apiKey, sttModel } = env.openai;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY (audio).");

  const ext = mimetype.includes("mpeg") || mimetype.includes("mp3")
    ? "mp3"
    : mimetype.includes("wav")
    ? "wav"
    : mimetype.includes("m4a") || mimetype.includes("mp4")
    ? "m4a"
    : "ogg";

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mimetype }), `audio.${ext}`);
  form.append("model", sttModel);
  form.append("language", "es");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as { text?: string };
  return (j.text ?? "").trim();
}

/** Texto → voz (TTS). Devuelve el audio en OGG/Opus (formato de nota de voz). */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const { apiKey, ttsModel, ttsVoice } = env.openai;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY (audio).");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: ttsVoice,
      input: text.slice(0, 4000),
      response_format: "opus", // OGG/Opus = nota de voz de WhatsApp
    }),
  });
  if (!res.ok) {
    throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
