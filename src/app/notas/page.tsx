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

export default function NotasPage() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/notes");
    const data = await res.json();
    if (data.ok) setNotes(data.notes);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

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
      // Nota huérfana (en DB pero sin archivo): solo permitir borrarla.
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
      if (data.ok) await loadList();
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
        await loadList();
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

  return (
    <>
      <h1>Notas</h1>
      <p className="subtitle">
        Lista de todas tus notas. Haz clic en una para ver, editar o borrar (útil
        si subiste algo por error). Al guardar se reindexa automáticamente.
      </p>

      <div className="notas-layout">
        {/* Lista */}
        <div className="card" style={{ maxHeight: 520, overflowY: "auto" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            {notes.length} nota(s)
          </p>
          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => openNote(n.id)}
              className="nota-item"
              style={{
                cursor: "pointer",
                padding: "8px 6px",
                borderRadius: 8,
                background: selected === n.id ? "#20242e" : "transparent",
              }}
            >
              <strong>{n.title ?? n.id}</strong>
              {n.summary && (
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {n.summary.slice(0, 90)}
                  {n.summary.length > 90 ? "…" : ""}
                </div>
              )}
            </div>
          ))}
          {notes.length === 0 && (
            <p className="muted">Aún no hay notas. Sube algo en “Ingerir”.</p>
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
                  style={{ background: "#a23" }}
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
