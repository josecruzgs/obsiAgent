"use client";

import { useEffect, useState } from "react";

interface SyncSummary {
  at: string;
  ok: number;
  failed: number;
  error?: string;
}
interface ScopeStatus {
  connected: boolean;
  account: string;
  folder: string;
  lastSync: SyncSummary | null;
}
interface Status {
  isSuperadmin: boolean;
  company: ScopeStatus;
  personal: ScopeStatus;
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

type Kind = "company" | "personal";

export default function ConfigPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  async function load() {
    const res = await fetch("/api/onedrive/status");
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) setBanner({ kind: "ok", msg: "OneDrive conectado." });
    else if (p.get("error")) setBanner({ kind: "error", msg: `Error: ${p.get("error")}` });
    if (p.get("connected") || p.get("error")) window.history.replaceState({}, "", "/config");
  }, []);

  return (
    <>
      <h1>Configuración</h1>
      <p className="subtitle">
        Conecta carpetas de OneDrive. Los archivos que dejes ahí (PDF, Word, texto,
        Markdown) se digieren con Claude y se añaden como notas; el original se mueve
        a <code>procesados</code> o <code>fallidos</code>.
      </p>

      {banner && (
        <div className="card">
          <p className={banner.kind === "ok" ? "success" : "error"}>
            {banner.kind === "ok" ? "✓ " : "✗ "}
            {banner.msg}
          </p>
        </div>
      )}

      {!status ? (
        <div className="card">
          <p className="muted">Cargando…</p>
        </div>
      ) : (
        <>
          <ScopeCard
            title="Base empresarial"
            hint="Compartida por toda la empresa. La conecta el superadmin."
            kind="company"
            data={status.company}
            canManage={status.isSuperadmin}
            onChanged={load}
            setBanner={setBanner}
          />
          <ScopeCard
            title="Mi base personal"
            hint="Privada: solo tú ves estas notas."
            kind="personal"
            data={status.personal}
            canManage={true}
            onChanged={load}
            setBanner={setBanner}
          />
        </>
      )}
    </>
  );
}

function ScopeCard({
  title,
  hint,
  kind,
  data,
  canManage,
  onChanged,
  setBanner,
}: {
  title: string;
  hint: string;
  kind: Kind;
  data: ScopeStatus;
  canManage: boolean;
  onChanged: () => void;
  setBanner: (b: { kind: "ok" | "error"; msg: string } | null) => void;
}) {
  const [folder, setFolder] = useState(data.folder);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);

  useEffect(() => setFolder(data.folder), [data.folder]);

  async function saveFolder() {
    setSaving(true);
    try {
      await fetch("/api/onedrive/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: kind, folder }),
      });
      onChanged();
      setBanner({ kind: "ok", msg: "Carpeta guardada." });
    } finally {
      setSaving(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch(`/api/onedrive/sync?scope=${kind}`, { method: "POST" });
      setSync((await res.json()) as SyncResult);
      onChanged();
    } catch (err) {
      setSync({ ok: false, error: String(err) });
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await fetch("/api/onedrive/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: kind }),
    });
    setSync(null);
    onChanged();
  }

  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <p className="muted" style={{ marginTop: -6 }}>{hint}</p>

      {data.connected ? (
        <p className="success" style={{ marginTop: 10 }}>
          ✓ Conectado{data.account ? ` como ${data.account}` : ""}
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 10 }}>No conectado.</p>
      )}

      {!canManage ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Solo el superadmin gestiona esta conexión.
        </p>
      ) : data.connected ? (
        <>
          <div style={{ height: 12 }} />
          <label>Carpeta (relativa a la raíz de OneDrive)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="ObsiAgent"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={saveFolder} disabled={saving || !folder.trim() || folder === data.folder}>
              {saving ? "…" : "Guardar"}
            </button>
          </div>
          <div style={{ height: 14 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={runSync} disabled={syncing}>
              {syncing ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
            <button type="button" className="secondary" onClick={disconnect} disabled={syncing}>
              Desconectar
            </button>
          </div>
          {data.lastSync && (
            <p className="muted" style={{ marginTop: 12 }}>
              Último sync: {new Date(data.lastSync.at).toLocaleString("es-MX")} ·{" "}
              {data.lastSync.ok} ok, {data.lastSync.failed} fallidos
              {data.lastSync.error ? ` · error: ${data.lastSync.error}` : ""}
            </p>
          )}
        </>
      ) : (
        <>
          <div style={{ height: 12 }} />
          <button
            type="button"
            onClick={() => (window.location.href = `/api/onedrive/connect?scope=${kind}`)}
          >
            Conectar OneDrive
          </button>
        </>
      )}

      {sync && (
        <div style={{ marginTop: 14 }}>
          {sync.ok ? (
            <p className="success">
              ✓ {sync.procesados}/{sync.encontrados} procesado(s), {sync.fallidos} fallido(s)
            </p>
          ) : (
            <p className="error">✗ {sync.error}</p>
          )}
          {sync.detalle?.procesados?.map((r, i) => (
            <p key={`p${i}`} className="success" style={{ margin: "2px 0", fontSize: 13 }}>
              ✓ {r.archivo} → {r.titulo}
            </p>
          ))}
          {sync.detalle?.errores?.map((r, i) => (
            <p key={`e${i}`} className="error" style={{ margin: "2px 0", fontSize: 13 }}>
              ✗ {r.archivo}: {r.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
