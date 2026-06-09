"use client";

// Pantalla de voz a pantalla completa, pensada para móvil: solo el micrófono,
// las ondas de voz y la UX de marcar / colgar. Respeta el tema (light/dark) y el
// acento del usuario porque todo el color sale de las variables CSS.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RetellWebClient } from "retell-client-js-sdk";

type CallState = "idle" | "connecting" | "live";

export default function VoiceCallScreen() {
  const router = useRouter();
  const clientRef = useRef<RetellWebClient | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [talking, setTalking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Temporizador de la llamada: arranca al entrar en "live" y se reinicia al colgar.
  useEffect(() => {
    if (state !== "live") {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Limpia la llamada si el componente se desmonta con la llamada activa.
  useEffect(() => () => clientRef.current?.stopCall(), []);

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

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  return (
    <div className={`voice-shell state-${state}${talking ? " is-talking" : ""}`}>
      <button
        type="button"
        className="voice-back"
        onClick={() => router.back()}
        aria-label="Volver"
      >
        <ArrowIcon />
      </button>

      <div className="voice-stage">
        <button
          type="button"
          className="voice-orb"
          onClick={state === "idle" ? start : undefined}
          disabled={state !== "idle"}
          aria-label={state === "idle" ? "Empezar a hablar" : "En llamada"}
        >
          <span className="voice-ring r1" aria-hidden="true" />
          <span className="voice-ring r2" aria-hidden="true" />
          <span className="voice-ring r3" aria-hidden="true" />
          <span className="voice-mic" aria-hidden="true">
            <MicIcon />
          </span>
        </button>

        <div className="voice-status">
          {state === "idle" && <span className="voice-hint">Toca para hablar</span>}
          {state === "connecting" && <span className="voice-hint">Conectando…</span>}
          {state === "live" && (
            <span className="voice-timer">
              <i className="voice-dot" aria-hidden="true" />
              {mmss}
            </span>
          )}
        </div>
      </div>

      <div className="voice-actions">
        {state === "live" && (
          <button
            type="button"
            className="voice-hangup"
            onClick={stop}
            aria-label="Colgar"
          >
            <HangupIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HangupIcon() {
  // Teléfono clásico rotado 135° = "colgar".
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path
        transform="rotate(135 12 12)"
        d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.3 1l-2.1 2.2z"
      />
    </svg>
  );
}
