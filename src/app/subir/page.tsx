"use client";

import { useState } from "react";

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

export default function SubirPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<UploadResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setLoading(true);
    setResp(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      setResp((await res.json()) as UploadResponse);
      if (res.ok) setFiles([]);
    } catch (err) {
      setResp({ ok: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Subir archivos</h1>
      <p className="subtitle">
        Sube PDF, Word (.docx), texto (.txt) o Markdown (.md). Puedes seleccionar
        varios a la vez. Claude generará título, resumen, tags y enlaces; luego se
        indexan para búsqueda.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="files">Archivos (selección múltiple)</label>
        <input
          id="files"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />

        {files.length > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            {files.length} archivo(s) seleccionado(s):{" "}
            {files.map((f) => f.name).join(", ")}
          </p>
        )}

        <div style={{ height: 16 }} />
        <button type="submit" disabled={loading || files.length === 0}>
          {loading ? "Procesando..." : "Subir y procesar"}
        </button>

        {loading && (
          <p className="muted" style={{ marginTop: 12 }}>
            Puede tardar según el número y tamaño de los archivos. No cierres la
            página.
          </p>
        )}
      </form>

      {resp && (
        <div className="card">
          {resp.ok ? (
            <>
              <p className="success">
                ✓ {resp.procesados}/{resp.total} archivo(s) procesado(s)
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {resp.resultados?.map((r, i) => (
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
            <p className="error">✗ {resp.error}</p>
          )}
        </div>
      )}
    </>
  );
}
