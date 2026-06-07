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
  const R = 38;
  const pos = (i: number) => {
    const a = ((-90 + (i * 360) / N) * Math.PI) / 180;
    return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) };
  };
  const stateOf = (ag: Agent): NodeState => {
    if (ag.status === "soon") return "soon";
    if (ag.running > 0) return "working";
    if (ag.lastActiveAt && now - ag.lastActiveAt < 3000) return "recent";
    return "idle";
  };
  const anyWorking = agents.some((a) => a.running > 0);

  return (
    <>
      <div className="agents-stage">
        <svg className="agents-lines" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {agents.map((ag, i) => {
            const p = pos(i);
            return (
              <line
                key={ag.key}
                x1="50"
                y1="50"
                x2={p.x}
                y2={p.y}
                className={`agents-line ${stateOf(ag)}`}
              />
            );
          })}
        </svg>

        <div
          className={`agent-node center${anyWorking ? " working" : ""}`}
          style={{ left: "50%", top: "50%" }}
        >
          <span className="agent-dot" />
          <strong>Orquestador</strong>
          <span className="agent-meta">{anyWorking ? "coordinando…" : "en espera"}</span>
        </div>

        {agents.map((ag, i) => {
          const p = pos(i);
          const st = stateOf(ag);
          return (
            <div
              key={ag.key}
              className={`agent-node ${st}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              title={ag.description}
            >
              <span className="agent-dot" />
              <strong>{ag.label}</strong>
              <span className="agent-meta">
                {ag.status === "soon"
                  ? "próximamente"
                  : st === "working"
                  ? "trabajando…"
                  : `${ag.totalRuns} corridas`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="agents-list">
        {agents.map((ag) => {
          const st = stateOf(ag);
          return (
            <div key={ag.key} className="agents-row">
              <span className={`agent-dot ${st}`} />
              <div className="agents-row-text">
                <strong>{ag.label}</strong>
                <span className="muted">{ag.description}</span>
              </div>
              <span className="agents-row-meta muted">
                {ag.status === "soon"
                  ? "—"
                  : st === "working"
                  ? "trabajando…"
                  : `${ag.totalRuns} corridas${
                      ag.lastTools.length ? ` · ${ag.lastTools.join(", ")}` : ""
                    }`}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
