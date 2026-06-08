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

// Detecta errores que requieren volver a conectar (token inválido / MFA).
function needsReauth(msg?: string): boolean {
  if (!msg) return false;
  return /AADSTS50076|invalid_grant|multi[-\s]?factor|OAuth token 40[01]|interaction_required|AADSTS7000(82|81)|consent/i.test(
    msg
  );
}

// Integraciones futuras (por ahora solo visuales). Sustituye los logos en
// /public/images cuando se implementen.
const INTEGRATIONS = [
  { name: "Google Drive", logo: "/images/integ-drive.svg" },
  { name: "Google Meet", logo: "/images/integ-meet.svg" },
  { name: "Dropbox", logo: "/images/integ-dropbox.svg" },
  { name: "PLAUD", logo: "/images/integ-plaud.svg" },
  { name: "Notion", logo: "/images/integ-notion.svg" },
  { name: "Slack", logo: "/images/integ-slack.svg" },
];

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
        <div className="config-cols">
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
        </div>
      )}

      {/* Más fuentes (próximamente, solo visual por ahora). */}
      <h2 style={{ margin: "10px 0 2px" }}>Más integraciones</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Conecta otras fuentes para ingerir tu información (próximamente).
      </p>
      <div className="integrations">
        {INTEGRATIONS.map((it) => (
          <div key={it.name} className="integration-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.logo} alt={it.name} className="integration-logo" />
            <strong>{it.name}</strong>
            <button
              type="button"
              className="secondary"
              title="Próximamente"
              onClick={() =>
                setBanner({
                  kind: "ok",
                  msg: `${it.name}: integración próximamente.`,
                })
              }
            >
              Conectar
            </button>
          </div>
        ))}
      </div>
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
  const [teams, setTeams] = useState<string | null>(null);
  const [syncingTeams, setSyncingTeams] = useState(false);

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

  async function syncTeams() {
    setSyncingTeams(true);
    setTeams(null);
    try {
      const res = await fetch(`/api/teams/sync?scope=${kind}`, { method: "POST" });
      const d = await res.json();
      setTeams(
        d.ok
          ? `✓ Teams: ${d.procesados}/${d.encontrados} transcripción(es) nueva(s), ${d.fallidos} fallida(s)`
          : `✗ ${d.error}`
      );
    } catch (err) {
      setTeams(`✗ ${String(err)}`);
    } finally {
      setSyncingTeams(false);
    }
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

      {data.connected && needsReauth(data.lastSync?.error) && (
        <div className="reauth-banner">
          <strong>⚠️ Reconecta OneDrive</strong>
          <p>
            El permiso de acceso expiró (tu organización ahora exige MFA), por eso
            la sincronización automática está fallando. Vuelve a conectar para
            reanudarla.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() =>
                (window.location.href = `/api/onedrive/connect?scope=${kind}`)
              }
            >
              Reconectar OneDrive
            </button>
          )}
        </div>
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

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="secondary"
              onClick={syncTeams}
              disabled={syncingTeams}
            >
              {syncingTeams ? "Trayendo transcripciones…" : "Sincronizar Teams (transcripciones)"}
            </button>
            <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Trae las transcripciones de tus reuniones de Teams (requiere cuenta de
              trabajo M365).
            </p>
            {teams && (
              <p
                className={teams.startsWith("✓") ? "success" : "error"}
                style={{ marginTop: 8, fontSize: 13 }}
              >
                {teams}
              </p>
            )}
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
