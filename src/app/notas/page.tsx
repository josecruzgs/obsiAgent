"use client";

import { useEffect, useState, useCallback } from "react";

interface NoteListItem {
  id: string;
  title: string | null;
  summary: string | null;
  tags: string[] | null;
  updated_at?: string;
}

interface NoteDetail {
  id: string;
  frontmatter: { title?: string; summary?: string; tags?: string[]; created?: string };
  body: string;
}

const PAGE_SIZE = 20;

export default function NotasPage() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadList = useCallback(async (query: string, p: number) => {
    const params = new URLSearchParams({
      q: query,
      limit: String(PAGE_SIZE),
      offset: String(p * PAGE_SIZE),
    });
    const res = await fetch(`/api/notes?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      setNotes(data.notes);
      setTotal(data.total ?? data.notes.length);
    }
  }, []);

  // Refetch al cambiar búsqueda o página (con pequeño debounce para el typing).
  useEffect(() => {
    const t = setTimeout(() => loadList(q, page), 250);
    return () => clearTimeout(t);
  }, [q, page, loadList]);

  function onSearchChange(value: string) {
    setQ(value);
    setPage(0); // vuelve a la primera página al buscar
  }

  async function openNote(id: string) {
    setMsg(null);
    setSelected(id);
    const res = await fetch(`/api/notes?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data.ok) {
      const n: NoteDetail = data.note;
      setTitle(n.frontmatter.title ?? n.id);
      setSummary(n.frontmatter.summary ?? "");
      setTags((n.frontmatter.tags ?? []).join(", "));
      setBody(n.body ?? "");
    } else {
      setTitle("");
      setSummary("");
      setTags("");
      setBody("");
      setMsg("⚠️ Esta nota está en la base pero no tiene archivo (huérfana). Puedes borrarla.");
    }
  }

  async function save() {
    if (!selected) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/notes?id=${encodeURIComponent(selected)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, tags, body }),
      });
      const data = await res.json();
      setMsg(data.ok ? "✓ Guardado e indexado." : `✗ ${data.error}`);
      if (data.ok) await loadList(q, page);
    } catch (err) {
      setMsg(`✗ ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!confirm(`¿Borrar la nota "${title || selected}"? No se puede deshacer.`)) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/notes?id=${encodeURIComponent(selected)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(null);
        setTitle("");
        setSummary("");
        setTags("");
        setBody("");
        await loadList(q, page);
        setMsg("✓ Nota borrada.");
      } else {
        setMsg(`✗ ${data.error}`);
      }
    } catch (err) {
      setMsg(`✗ ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>Notas</h1>
      <p className="subtitle">
        Busca, abre, edita o borra tus notas (útil si subiste algo por error). Al
        guardar se reindexa automáticamente.
      </p>

      <div className="notas-layout">
        {/* Lista + búsqueda + paginación */}
        <div className="card">
          <input
            type="text"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="🔍 Buscar por título, resumen o tag…"
          />
          <p className="muted" style={{ fontSize: 13, margin: "10px 0" }}>
            {total} nota(s){q ? ` para “${q}”` : ""}
          </p>

          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {notes.map((n) => (
              <div
                key={n.id}
                onClick={() => openNote(n.id)}
                className="nota-item"
                style={{
                  cursor: "pointer",
                  padding: "8px 6px",
                  borderRadius: 10,
                  background: selected === n.id ? "var(--accent-soft)" : "transparent",
                }}
              >
                <strong>{n.title ?? n.id}</strong>
                {n.summary && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {n.summary.slice(0, 80)}
                    {n.summary.length > 80 ? "…" : ""}
                  </div>
                )}
              </div>
            ))}
            {notes.length === 0 && (
              <p className="muted">
                {q ? "Sin resultados." : "Aún no hay notas. Sube algo en “Ingerir”."}
              </p>
            )}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 12,
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Anterior
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Página {page + 1} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="card">
          {selected ? (
            <>
              <label htmlFor="t">Título</label>
              <input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div style={{ height: 12 }} />
              <label htmlFor="s">Resumen</label>
              <input id="s" type="text" value={summary} onChange={(e) => setSummary(e.target.value)} />
              <div style={{ height: 12 }} />
              <label htmlFor="tg">Tags (separados por coma)</label>
              <input id="tg" type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
              <div style={{ height: 12 }} />
              <label htmlFor="b">Contenido</label>
              <textarea id="b" value={body} onChange={(e) => setBody(e.target.value)} />
              <div style={{ height: 16 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={save} disabled={loading || !title.trim()}>
                  {loading ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={loading}
                  style={{ background: "var(--danger)", boxShadow: "none" }}
                >
                  Borrar
                </button>
              </div>
              {msg && (
                <p className={msg.startsWith("✓") ? "success" : "error"} style={{ marginTop: 12 }}>
                  {msg}
                </p>
              )}
            </>
          ) : (
            <p className="muted">Selecciona una nota de la lista para verla o editarla.</p>
          )}
        </div>
      </div>
    </>
  );
}
