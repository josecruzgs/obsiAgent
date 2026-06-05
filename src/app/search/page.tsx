"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface SearchResult {
  ok: boolean;
  answer?: string;
  sources?: { id: string; title: string | null }[];
  error?: string;
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Buscar en tu conocimiento</h1>
      <p className="subtitle">
        Pregunta en lenguaje natural. Se buscan las notas más relevantes
        (búsqueda semántica) y Claude responde citando fuentes.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="q">Tu pregunta</label>
        <input
          id="q"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej. ¿Qué decidimos sobre el presupuesto Q2?"
          required
        />
        <div style={{ height: 14 }} />
        <button type="submit" disabled={loading || !q.trim()}>
          {loading ? "Buscando…" : "Preguntar"}
        </button>
      </form>

      {result && (
        <div className="card">
          {result.ok ? (
            <>
              <div className="answer">
                <ReactMarkdown>{result.answer}</ReactMarkdown>
              </div>
              {result.sources && result.sources.length > 0 && (
                <p className="muted" style={{ marginTop: 12 }}>
                  Fuentes:{" "}
                  {result.sources.map((s) => s.title ?? s.id).join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p className="error">✗ {result.error}</p>
          )}
        </div>
      )}
    </>
  );
}
