"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

interface SearchResult {
  ok: boolean;
  answer?: string;
  sources?: { id: string; title: string | null }[];
  error?: string;
}

export default function HeaderBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [activeQuery, setActiveQuery] = useState("");

  const run = useCallback(async (question: string) => {
    const v = question.trim();
    if (!v) return;
    setActiveQuery(v);
    setOpen(true);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: v }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  // Otros componentes (p.ej. el grafo) pueden abrir la búsqueda con un evento.
  useEffect(() => {
    function onEvt(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string") run(detail);
    }
    window.addEventListener("obsi-search", onEvt as EventListener);
    return () => window.removeEventListener("obsi-search", onEvt as EventListener);
  }, [run]);

  // Cerrar el modal con Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(q);
  }

  return (
    <div className="hero">
      <div className="hero-eyebrow">obsiAgent</div>
      <div className="hero-title">Tu base de conocimiento</div>
      <form className="hero-search" onSubmit={submit}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pregunta a tu conocimiento… (ej. ¿qué sé del despacho?)"
        />
        <button type="submit" disabled={!q.trim()}>
          Buscar
        </button>
      </form>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>🔍 {activeQuery}</strong>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {loading && <p className="muted">Buscando…</p>}
              {result &&
                (result.ok ? (
                  <>
                    <div className="answer">
                      <ReactMarkdown>{result.answer ?? ""}</ReactMarkdown>
                    </div>
                    {result.sources && result.sources.length > 0 && (
                      <p className="muted" style={{ marginTop: 14 }}>
                        Fuentes:{" "}
                        {result.sources.map((s) => s.title ?? s.id).join(" · ")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="error">✗ {result.error}</p>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
