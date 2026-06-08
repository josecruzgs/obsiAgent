"use client";

import { useEffect, useState } from "react";

interface Agent {
  key: string;
  label: string;
  description: string;
  status: "active" | "soon";
  running: number;
  totalRuns: number;
  lastActiveAt: number | null;
  lastTools: string[];
}

type NodeState = "working" | "recent" | "idle" | "soon";

// Color por agente (look "constelación").
const PALETTE = ["#3ad1e6", "#ffa14d", "#4ee6b8", "#7aa8ff", "#c08bff", "#ff7b9c"];

export default function AgentsBoard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/agents/status");
        const d = await res.json();
        if (alive && d.ok) {
          setAgents(d.agents);
          setNow(d.now);
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }
    poll();
    const id = setInterval(poll, 1200);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const N = Math.max(agents.length, 1);
  const R = 33; // radio de los nodos (en unidades del viewBox 0-100)
  const ang = (i: number) => ((-90 + (i * 360) / N) * Math.PI) / 180;
  const at = (a: number, d: number) => ({ x: 50 + d * Math.cos(a), y: 50 + d * Math.sin(a) });

  const stateOf = (ag: Agent): NodeState => {
    if (ag.status === "soon") return "soon";
    if (ag.running > 0) return "working";
    if (ag.lastActiveAt && now - ag.lastActiveAt < 3000) return "recent";
    return "idle";
  };
  const anyWorking = agents.some((a) => a.running > 0);

  return (
    <div className="agents-stage">
        <svg
          className="agents-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="agCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(180,165,255,0.8)" />
              <stop offset="55%" stopColor="rgba(139,123,255,0.2)" />
              <stop offset="100%" stopColor="rgba(139,123,255,0)" />
            </radialGradient>
            <linearGradient id="agFacetL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2dcff" />
              <stop offset="100%" stopColor="#9b8cff" />
            </linearGradient>
            <linearGradient id="agFacetR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6c5ce7" />
              <stop offset="100%" stopColor="#2a1f63" />
            </linearGradient>
          </defs>

          {/* Líneas + partículas hacia cada agente */}
          {agents.map((ag, i) => {
            const a = ang(i);
            const s = at(a, 21);
            const e = at(a, 29);
            const st = stateOf(ag);
            const parts = [0.25, 0.5, 0.78].map((t) => at(a, 21 + (29 - 21) * t));
            return (
              <g
                key={ag.key}
                className={`agents-edge ${st}`}
                style={{ "--c": PALETTE[i % PALETTE.length] } as React.CSSProperties}
              >
                <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} className="agents-line" />
                {parts.map((p, j) => (
                  <circle
                    key={j}
                    cx={p.x}
                    cy={p.y}
                    r="0.55"
                    className="agents-particle"
                    style={{ animationDelay: `${j * 0.6}s` }}
                  />
                ))}
              </g>
            );
          })}

          {/* Órbitas punteadas */}
          <circle cx="50" cy="50" r="16" className="orbit orbit-in" />
          <circle cx="50" cy="50" r="20" className="orbit orbit-out" />

          {/* Cristal central */}
          <circle
            cx="50"
            cy="50"
            r="14"
            fill="url(#agCoreGlow)"
            className={`crystal-glow${anyWorking ? " working" : ""}`}
          />
          <g className="crystal">
            <polygon points="50,38 41.5,50 50,62" fill="url(#agFacetL)" />
            <polygon points="50,38 58.5,50 50,62" fill="url(#agFacetR)" />
            <line x1="50" y1="38" x2="50" y2="62" className="crystal-edge" />
          </g>
        </svg>

        {/* Etiqueta del orquestador */}
        <div className="scene-center">
          <strong>ORQUESTADOR</strong>
          <span>{anyWorking ? "coordinando…" : "en espera"}</span>
        </div>

        {/* Nodos de agentes */}
        {agents.map((ag, i) => {
          const p = at(ang(i), R);
          const st = stateOf(ag);
          return (
            <div
              key={ag.key}
              className={`scene-node ${st}`}
              style={
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  "--c": PALETTE[i % PALETTE.length],
                } as React.CSSProperties
              }
              title={ag.description}
            >
              <span className="scene-core" />
              <div className="scene-label">
                <strong>{ag.label}</strong>
                <span className="scene-tag">
                  {ag.status === "soon"
                    ? "próximamente"
                    : st === "working"
                    ? "trabajando…"
                    : ag.description}
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
