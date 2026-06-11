"use client";

import { useEffect, useRef, useState } from "react";
import { IconUpload, IconEdit, IconCloudUpload, IconClose } from "@/components/icons";

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
  // ── Ámbito de destino (empresarial / personal) ───────────────────────
  const [scope, setScope] = useState<"personal" | "company">("personal");
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role === "superadmin") {
          setIsSuperadmin(true);
          // Por defecto, el superadmin ingiere a la base EMPRESARIAL (la que
          // lee el agente). Puede cambiar el select a personal si lo desea.
          setScope("company");
        }
      })
      .catch(() => {});
  }, []);

  // ── Flujo 1: subir archivos ──────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    // Importante: materializa el array AHORA (sincrónico). El onChange limpia
    // `e.target.value` justo después, lo que vacía el FileList; si dejáramos el
    // `Array.from(list)` dentro del updater de setFiles (que corre después),
    // leería una lista ya vacía y no se adjuntaría nada.
    const arr = Array.from(list);
    setFiles((prev) => [...prev, ...arr]);
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setUpload(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("scope", scope);
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
        body: JSON.stringify({ raw, title: title || undefined, scope }),
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
    <div className="ingest">
      <h1>Ingerir documentos</h1>
      <p className="subtitle">
        Sube archivos (PDF, Word, texto, Markdown) o pega texto. Claude generará
        título, resumen, tags y enlaces a notas existentes; luego se indexa para
        búsqueda.
      </p>

      <div className="card">
        <label htmlFor="scope">¿A qué base se añadirá?</label>
        <select
          id="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as "personal" | "company")}
        >
          <option value="personal">Mi base personal (privada)</option>
          {isSuperadmin && <option value="company">Base empresarial (compartida)</option>}
        </select>
        <p className="muted" style={{ marginTop: 8 }}>
          {scope === "company"
            ? "Estas notas las verá toda la empresa."
            : "Estas notas solo las verás tú."}
          {!isSuperadmin && " Solo el superadmin puede añadir a la base empresarial."}
        </p>
      </div>

      <div className="ingest-cols">
        <div className="ingest-col">
      {/* ── Subir archivos ── */}
      <form onSubmit={handleUpload} className="card">
        <h2 className="card-title">
          <IconUpload width={18} height={18} /> Subir archivos
        </h2>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown,.vtt"
          style={{ display: "none" }}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ""; // permite re-seleccionar el mismo archivo
          }}
        />

        <div
          className={`dropzone${dragging ? " drag" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <span className="dropzone-icon">
            <IconCloudUpload />
          </span>
          <div className="dropzone-text">
            <strong>Arrastra y suelta tus archivos</strong>
            <span>o haz clic para seleccionar · PDF, Word, TXT, MD</span>
          </div>
        </div>

        {files.length > 0 && (
          <div className="file-chips">
            {files.map((f, i) => (
              <span key={i} className="file-chip">
                {f.name}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Quitar ${f.name}`}
                >
                  <IconClose width={14} height={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div style={{ height: 16 }} />
        <button type="submit" disabled={uploading || files.length === 0}>
          {uploading
            ? "Procesando…"
            : `Subir y procesar${files.length ? ` (${files.length})` : ""}`}
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
        </div>

        <div className="ingest-col">
      {/* ── Pegar texto ── */}
      <form onSubmit={handleText} className="card">
        <h2 className="card-title">
          <IconEdit width={18} height={18} /> O pegar texto
        </h2>
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
        </div>
      </div>
    </div>
  );
}
