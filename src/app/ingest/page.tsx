"use client";

import { useState } from "react";

interface IngestResult {
  ok: boolean;
  id?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  links?: string[];
  error?: string;
}

export default function IngestPage() {
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw, title: title || undefined }),
      });
      const data: IngestResult = await res.json();
      setResult(data);
      if (data.ok) {
        setRaw("");
        setTitle("");
      }
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  return (
    <>
      <h1>Ingerir documento</h1>
      <p className="subtitle">
        Pega texto o sube un archivo. Claude generará título, resumen, tags y
        enlaces a notas existentes; luego se indexa para búsqueda.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="title">Título (opcional — la IA puede mejorarlo)</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Notas reunión Q2"
        />

        <div style={{ height: 14 }} />

        <label htmlFor="raw">Contenido raw</label>
        <textarea
          id="raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Pega aquí el documento..."
          required
        />

        <div style={{ height: 12 }} />
        <input type="file" accept=".md,.txt,.markdown,text/*" onChange={handleFile} />

        <div style={{ height: 16 }} />
        <button type="submit" disabled={loading || !raw.trim()}>
          {loading ? "Digiriendo..." : "Digerir y guardar"}
        </button>
      </form>

      {result && (
        <div className="card">
          {result.ok ? (
            <>
              <p className="success">✓ Nota creada: {result.title}</p>
              <p className="muted">{result.summary}</p>
              <div>
                {result.tags?.map((t) => (
                  <span key={t} className="tag">
                    #{t}
                  </span>
                ))}
              </div>
              {result.links && result.links.length > 0 && (
                <p className="muted" style={{ marginTop: 12 }}>
                  Enlazada con: {result.links.map((l) => `[[${l}]]`).join(", ")}
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
