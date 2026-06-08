"use client";

import { useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";

type CallState = "idle" | "connecting" | "live";

export default function VoiceCallButton() {
  const clientRef = useRef<RetellWebClient | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [talking, setTalking] = useState(false);

  async function start() {
    if (state !== "idle") return;
    setState("connecting");
    try {
      const res = await fetch("/api/voice/webcall", { method: "POST" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "error");

      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => setState("live"));
      client.on("call_ended", () => {
        setState("idle");
        setTalking(false);
        clientRef.current = null;
      });
      client.on("agent_start_talking", () => setTalking(true));
      client.on("agent_stop_talking", () => setTalking(false));
      client.on("error", (e: unknown) => {
        console.error("[retell] error:", e);
        client.stopCall();
        setState("idle");
      });

      await client.startCall({ accessToken: d.accessToken });
    } catch (e) {
      console.error(e);
      setState("idle");
      alert(
        "No se pudo iniciar la llamada de voz. Revisa RETELL_API_KEY/RETELL_AGENT_ID y permisos del micrófono."
      );
    }
  }

  function stop() {
    clientRef.current?.stopCall();
    setState("idle");
    setTalking(false);
  }

  if (state === "idle") {
    return (
      <button type="button" className="voice-call-btn" onClick={start}>
        🎙️ Hablar con el agente
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`voice-call-btn live${talking ? " talking" : ""}`}
      onClick={stop}
    >
      {state === "connecting"
        ? "Conectando…"
        : talking
        ? "🔴 Hablando… (colgar)"
        : "🔴 En llamada (colgar)"}
    </button>
  );
}
