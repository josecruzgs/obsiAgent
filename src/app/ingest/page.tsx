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

interface FileResult {
  archivo: string;
  ok: boolean;
  id?: string;
  titulo?: string;
  error?: string;
}

interface UploadResponse {
  ok: boolean;
  total?: number;
  procesados?: number;
  resultados?: FileResult[];
  error?: string;
}

export default function IngestPage() {
  // ── Flujo 1: subir archivos ──────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<UploadResponse | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setUpload(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      setUpload((await res.json()) as UploadResponse);
      if (res.ok) setFiles([]);
    } catch (err) {
      setUpload({ ok: false, error: String(err) });
    } finally {
      setUploading(false);
    }
  }

  // ── Flujo 2: pegar texto ─────────────────────────────────────────────
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  async function handleText(e: React.FormEvent) {
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

  return (
    <>
      <h1>Ingerir documentos</h1>
      <p className="subtitle">
        Sube archivos (PDF, Word, texto, Markdown) o pega texto. Claude generará
        título, resumen, tags y enlaces a notas existentes; luego se indexa para
        búsqueda.
      </p>

      {/* ── Subir archivos ── */}
      <form onSubmit={handleUpload} className="card">
        <h2 style={{ marginTop: 0 }}>📎 Subir archivos</h2>
        <label htmlFor="files">PDF, Word (.docx), .txt o .md — varios a la vez</label>
        <input
          id="files"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            {files.length} archivo(s): {files.map((f) => f.name).join(", ")}
          </p>
        )}
        <div style={{ height: 16 }} />
        <button type="submit" disabled={uploading || files.length === 0}>
          {uploading ? "Procesando..." : "Subir y procesar"}
        </button>
        {uploading && (
          <p className="muted" style={{ marginTop: 12 }}>
            Puede tardar según el número y tamaño. No cierres la página.
          </p>
        )}
      </form>

      {upload && (
        <div className="card">
          {upload.ok ? (
            <>
              <p className="success">
                ✓ {upload.procesados}/{upload.total} archivo(s) procesado(s)
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {upload.resultados?.map((r, i) => (
                  <li
                    key={i}
                    className={r.ok ? "success" : "error"}
                    style={{ marginBottom: 4 }}
                  >
                    {r.ok
                      ? `✓ ${r.archivo} → ${r.titulo}`
                      : `✗ ${r.archivo}: ${r.error}`}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="error">✗ {upload.error}</p>
          )}
        </div>
      )}

      {/* ── Pegar texto ── */}
      <form onSubmit={handleText} className="card">
        <h2 style={{ marginTop: 0 }}>✍️ O pegar texto</h2>
        <label htmlFor="title">Título (opcional — la IA puede mejorarlo)</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Notas reunión Q2"
        />

        <div style={{ height: 14 }} />

        <label htmlFor="raw">Contenido</label>
        <textarea
          id="raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Pega aquí el documento..."
        />

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
