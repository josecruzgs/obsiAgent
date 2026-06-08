// Página dedicada para hablar por voz con el asistente (Retell web call).
// Pensada para abrirse desde un enlace (p. ej. enviado por WhatsApp).
import VoiceCallButton from "@/components/VoiceCallButton";

export default function VozPage() {
  return (
    <>
      <h1>Hablar por voz</h1>
      <p className="subtitle">
        Pulsa el botón, permite el micrófono y habla con tu asistente. Responde con
        la información de tu base de conocimiento.
      </p>
      <div style={{ marginTop: 18 }}>
        <VoiceCallButton />
      </div>
    </>
  );
}
