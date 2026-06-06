"use client";

import { useEffect, useState } from "react";

interface SyncSummary {
  at: string;
  ok: number;
  failed: number;
  error?: string;
}

interface Status {
  connected: boolean;
  account: string;
  folder: string;
  lastSync: SyncSummary | null;
}

interface SyncResult {
  ok: boolean;
  encontrados?: number;
  procesados?: number;
  fallidos?: number;
  error?: string;
  detalle?: {
    procesados: { archivo: string; titulo: string }[];
    errores: { archivo: string; error: string }[];
  };
}

export default function ConfigPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [folder, setFolder] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/onedrive/status");
    const data: Status = await res.json();
    setStatus(data);
    setFolder(data.folder);
  }

  useEffect(() => {
    loadStatus();
    // Mensajes que deja el callback de OAuth en la URL.
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) {
      setBanner({ kind: "ok", msg: "OneDrive conectado correctamente." });
    } else if (p.get("error")) {
      setBanner({ kind: "error", msg: `Error al conectar: ${p.get("error")}` });
    }
    if (p.get("connected") || p.get("error")) {
      window.history.replaceState({}, "", "/config");
    }
  }, []);

  async function saveFolder() {
    setSavingFolder(true);
    try {
      await fetch("/api/onedrive/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      await loadStatus();
      setBanner({ kind: "ok", msg: "Carpeta guardada." });
    } finally {
      setSavingFolder(false);
    }
  }

  async function disconnect() {
    await fetch("/api/onedrive/disconnect", { method: "POST" });
    setSync(null);
    await loadStatus();
    setBanner({ kind: "ok", msg: "OneDrive desconectado." });
  }

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch("/api/onedrive/sync", { method: "POST" });
      setSync((await res.json()) as SyncResult);
      await loadStatus();
    } catch (err) {
      setSync({ ok: false, error: String(err) });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <h1>Configuración</h1>
      <p className="subtitle">
        Conecta una carpeta de OneDrive. Los archivos que dejes ahí
        (PDF, Word, texto, Markdown) se digieren con Claude y se añaden como notas
        a tu vault; el original se mueve a <code>procesados</code> o{" "}
        <code>fallidos</code> dentro de esa misma carpeta.
      </p>

      {banner && (
        <div className="card">
          <p className={banner.kind === "ok" ? "success" : "error"}>
            {banner.kind === "ok" ? "✓ " : "✗ "}
            {banner.msg}
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">OneDrive</h2>

        {!status ? (
          <p className="muted">Cargando…</p>
        ) : status.connected ? (
          <>
            <p className="success">✓ Conectado{status.account ? ` como ${status.account}` : ""}</p>

            <div style={{ height: 14 }} />
            <label htmlFor="folder">Carpeta a vigilar (relativa a la raíz de OneDrive)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="folder"
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="ObsiAgent"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={saveFolder}
                disabled={savingFolder || !folder.trim() || folder === status.folder}
              >
                {savingFolder ? "Guardando…" : "Guardar"}
              </button>
            </div>

            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={runSync} disabled={syncing}>
                {syncing ? "Sincronizando…" : "Sincronizar ahora"}
              </button>
              <button type="button" className="secondary" onClick={disconnect} disabled={syncing}>
                Desconectar
              </button>
            </div>

            {status.lastSync && (
              <p className="muted" style={{ marginTop: 12 }}>
                Último sync: {new Date(status.lastSync.at).toLocaleString("es-MX")} ·{" "}
                {status.lastSync.ok} ok, {status.lastSync.failed} fallidos
                {status.lastSync.error ? ` · error: ${status.lastSync.error}` : ""}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="muted">No conectado.</p>
            <div style={{ height: 12 }} />
            <button type="button" onClick={() => (window.location.href = "/api/onedrive/connect")}>
              Conectar OneDrive
            </button>
          </>
        )}
      </div>

      {sync && (
        <div className="card">
          {sync.ok ? (
            <>
              <p className="success">
                ✓ {sync.procesados}/{sync.encontrados} procesado(s), {sync.fallidos} fallido(s)
              </p>
              {sync.detalle && sync.detalle.procesados.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {sync.detalle.procesados.map((r, i) => (
                    <li key={i} className="success" style={{ marginBottom: 4 }}>
                      ✓ {r.archivo} → {r.titulo}
                    </li>
                  ))}
                </ul>
              )}
              {sync.detalle && sync.detalle.errores.length > 0 && (
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {sync.detalle.errores.map((r, i) => (
                    <li key={i} className="error" style={{ marginBottom: 4 }}>
                      ✗ {r.archivo}: {r.error}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="error">✗ {sync.error}</p>
          )}
        </div>
      )}
    </>
  );
}
