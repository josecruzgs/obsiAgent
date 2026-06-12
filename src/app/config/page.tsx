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
interface SharePointStatus {
  available: boolean; // hay cuenta de trabajo (OneDrive empresarial) conectada
  configured: boolean; // ya se eligió un sitio/biblioteca
  siteUrl: string;
  siteName: string;
  folder: string;
  lastSync: SyncSummary | null;
}
interface Status {
  isSuperadmin: boolean;
  company: ScopeStatus;
  personal: ScopeStatus;
  sharepoint: SharePointStatus;
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
type Expandable = Kind | "sharepoint";

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

const ONEDRIVE_LOGO = "/images/integ-onedrive.svg";
const TEAMS_LOGO = "/images/integ-teams.svg";
const SHAREPOINT_LOGO = "/images/integ-sharepoint.svg";

export default function ConfigPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  // Qué tarjeta está desplegada (panel de gestión abierto).
  const [expanded, setExpanded] = useState<Expandable | null>(null);

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

  function toggle(kind: Expandable) {
    setExpanded((cur) => (cur === kind ? null : kind));
  }

  return (
    <>
      <h1>Configuración</h1>
      <p className="subtitle">
        Tus fuentes de información. Si inicias sesión con tu cuenta Microsoft 365,
        OneDrive, Teams y SharePoint quedan conectados automáticamente: aquí solo
        eliges qué carpetas y sitios sincronizar. Los archivos que dejes en OneDrive
        (PDF, Word, texto, Markdown) se digieren con Claude y se añaden como notas;
        el original se mueve a <code>procesados</code> o <code>fallidos</code>.
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
          <div className="integrations">
            <OneDriveTile
              name="OneDrive empresarial"
              kind="company"
              data={status.company}
              canManage={status.isSuperadmin}
              expanded={expanded === "company"}
              onToggle={() => toggle("company")}
            />
            <OneDriveTile
              name="OneDrive personal"
              kind="personal"
              data={status.personal}
              canManage={true}
              expanded={expanded === "personal"}
              onToggle={() => toggle("personal")}
            />
            <TeamsTile
              connected={status.company.connected}
              canManage={status.isSuperadmin}
              onManage={() => toggle("company")}
            />
            <SharePointTile
              data={status.sharepoint}
              canManage={status.isSuperadmin}
              expanded={expanded === "sharepoint"}
              onManage={() => toggle("sharepoint")}
            />
            {INTEGRATIONS.map((it) => (
              <div key={it.name} className="integration-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.logo} alt={it.name} className="integration-logo" />
                <strong>{it.name}</strong>
                <span className="integration-status muted">Próximamente</span>
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

          {/* Panel de gestión desplegable. */}
          {expanded === "sharepoint" ? (
            <SharePointDetail
              data={status.sharepoint}
              canManage={status.isSuperadmin}
              onChanged={load}
              setBanner={setBanner}
              onClose={() => setExpanded(null)}
            />
          ) : expanded && status[expanded].connected ? (
            <ScopeDetail
              kind={expanded}
              title={expanded === "company" ? "OneDrive empresarial" : "OneDrive personal"}
              data={status[expanded]}
              canManage={expanded === "company" ? status.isSuperadmin : true}
              onChanged={load}
              setBanner={setBanner}
              onClose={() => setExpanded(null)}
            />
          ) : null}
        </>
      )}
    </>
  );
}

// ─── Tarjeta uniforme de OneDrive (empresarial / personal) ─────────────────
function OneDriveTile({
  name,
  kind,
  data,
  canManage,
  expanded,
  onToggle,
}: {
  name: string;
  kind: Kind;
  data: ScopeStatus;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reauth = data.connected && needsReauth(data.lastSync?.error);

  let status: React.ReactNode;
  if (reauth) status = <span className="integration-status warn">⚠️ Reconecta</span>;
  else if (data.connected)
    status = (
      <span className="integration-status ok" title={data.account}>
        ✓ Conectado
      </span>
    );
  else status = <span className="integration-status muted">No conectado</span>;

  // Servicios que habilita esta conexión (la empresarial es una cuenta de
  // trabajo M365: incluye OneDrive, Teams y SharePoint; la personal solo OneDrive).
  const enables =
    kind === "company"
      ? [
          { src: ONEDRIVE_LOGO, name: "OneDrive" },
          { src: TEAMS_LOGO, name: "Teams" },
          { src: SHAREPOINT_LOGO, name: "SharePoint" },
        ]
      : [{ src: ONEDRIVE_LOGO, name: "OneDrive" }];

  let action: React.ReactNode;
  if (!canManage) {
    action = (
      <span className="integration-status muted" style={{ fontSize: 11 }}>
        Lo gestiona el superadmin
      </span>
    );
  } else if (data.connected) {
    action = (
      <button type="button" className="secondary" onClick={onToggle}>
        {expanded ? "Cerrar" : "Gestionar"}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={() => (window.location.href = `/api/onedrive/connect?scope=${kind}`)}
      >
        Conectar
      </button>
    );
  }

  return (
    <div className={`integration-card${expanded ? " active" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ONEDRIVE_LOGO} alt={name} className="integration-logo" />
      <strong>{name}</strong>
      {status}
      {!data.connected && (
        <div
          className="integration-enables"
          title={`Al conectar habilitas: ${enables.map((e) => e.name).join(", ")}`}
        >
          <span className="integration-enables-label">Incluye</span>
          {enables.map((e) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={e.name} src={e.src} alt={e.name} />
          ))}
        </div>
      )}
      {action}
    </div>
  );
}

// ─── Tarjeta de Microsoft Teams (usa la cuenta de trabajo del OneDrive empresarial) ──
function TeamsTile({
  connected,
  canManage,
  onManage,
}: {
  connected: boolean;
  canManage: boolean;
  onManage: () => void;
}) {
  let action: React.ReactNode;
  if (!canManage) {
    action = (
      <span className="integration-status muted" style={{ fontSize: 11 }}>
        Lo gestiona el superadmin
      </span>
    );
  } else if (connected) {
    action = (
      <button type="button" className="secondary" onClick={onManage}>
        Gestionar
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={() => (window.location.href = `/api/onedrive/connect?scope=company`)}
      >
        Conectar
      </button>
    );
  }

  return (
    <div className="integration-card" title="Transcripciones de reuniones de Teams">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={TEAMS_LOGO} alt="Microsoft Teams" className="integration-logo" />
      <strong>Microsoft Teams</strong>
      {connected ? (
        <span className="integration-status ok">✓ Conectado</span>
      ) : (
        <span className="integration-status muted">No conectado</span>
      )}
      {action}
    </div>
  );
}

// ─── Tarjeta de SharePoint (usa la cuenta de trabajo del OneDrive empresarial) ──
function SharePointTile({
  data,
  canManage,
  expanded,
  onManage,
}: {
  data: SharePointStatus;
  canManage: boolean;
  expanded: boolean;
  onManage: () => void;
}) {
  let status: React.ReactNode;
  if (!data.available)
    status = <span className="integration-status muted">Requiere OneDrive empresarial</span>;
  else if (data.configured)
    status = (
      <span className="integration-status ok" title={data.siteName || data.siteUrl}>
        ✓ Conectado
      </span>
    );
  else status = <span className="integration-status muted">Sin configurar</span>;

  let action: React.ReactNode;
  if (!canManage) {
    action = (
      <span className="integration-status muted" style={{ fontSize: 11 }}>
        Lo gestiona el superadmin
      </span>
    );
  } else if (!data.available) {
    action = (
      <button
        type="button"
        onClick={() => (window.location.href = `/api/onedrive/connect?scope=company`)}
      >
        Conectar
      </button>
    );
  } else {
    action = (
      <button type="button" className="secondary" onClick={onManage}>
        {expanded ? "Cerrar" : data.configured ? "Gestionar" : "Configurar"}
      </button>
    );
  }

  return (
    <div className={`integration-card${expanded ? " active" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SHAREPOINT_LOGO} alt="SharePoint" className="integration-logo" />
      <strong>SharePoint</strong>
      {status}
      {action}
    </div>
  );
}

// ─── Panel de gestión de SharePoint (sitio + carpeta + sincronizar) ─────────
function SharePointDetail({
  data,
  canManage,
  onChanged,
  setBanner,
  onClose,
}: {
  data: SharePointStatus;
  canManage: boolean;
  onChanged: () => void;
  setBanner: (b: { kind: "ok" | "error"; msg: string } | null) => void;
  onClose: () => void;
}) {
  const [siteUrl, setSiteUrl] = useState(data.siteUrl);
  const [folder, setFolder] = useState(data.folder);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);

  useEffect(() => setSiteUrl(data.siteUrl), [data.siteUrl]);
  useEffect(() => setFolder(data.folder), [data.folder]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/sharepoint/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, folder }),
      });
      const d = await res.json();
      if (d.ok) {
        setBanner({
          kind: "ok",
          msg: d.configured ? `SharePoint vinculado: ${d.siteName}` : "SharePoint desvinculado.",
        });
        onChanged();
      } else {
        setBanner({ kind: "error", msg: d.error || "No se pudo guardar." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch("/api/sharepoint/sync", { method: "POST" });
      setSync((await res.json()) as SyncResult);
      onChanged();
    } catch (err) {
      setSync({ ok: false, error: String(err) });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="card integration-detail">
      <div className="integration-detail-head">
        <h2 className="card-title" style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHAREPOINT_LOGO} alt="" className="integration-logo" style={{ width: 24, height: 24 }} />
          SharePoint
        </h2>
        <button type="button" className="secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {!canManage ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Solo el superadmin gestiona esta conexión.
        </p>
      ) : !data.available ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Primero conecta el OneDrive empresarial (SharePoint usa la misma cuenta de
          trabajo).
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Pega la URL de un sitio de SharePoint (p. ej.{" "}
            <code>https://tuempresa.sharepoint.com/sites/Equipo</code>). Se ingiere su
            biblioteca de documentos (solo lectura, no mueve archivos).
          </p>

          <div style={{ height: 10 }} />
          <label>URL del sitio de SharePoint</label>
          <input
            type="text"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://tuempresa.sharepoint.com/sites/Equipo"
          />

          <div style={{ height: 12 }} />
          <label>Carpeta dentro de la biblioteca (opcional)</label>
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="(raíz)"
          />

          <div style={{ height: 14 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={save} disabled={saving}>
              {saving ? "Validando…" : "Guardar"}
            </button>
            {data.configured && (
              <>
                <button type="button" onClick={runSync} disabled={syncing}>
                  {syncing ? "Sincronizando…" : "Sincronizar ahora"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSiteUrl("");
                    setFolder("");
                    fetch("/api/sharepoint/config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ siteUrl: "", folder: "" }),
                    }).then(() => {
                      setBanner({ kind: "ok", msg: "SharePoint desvinculado." });
                      onChanged();
                    });
                  }}
                  disabled={syncing || saving}
                >
                  Quitar
                </button>
              </>
            )}
          </div>

          {data.configured && data.siteName && (
            <p className="success" style={{ marginTop: 12, fontSize: 13 }}>
              ✓ Vinculado a <strong>{data.siteName}</strong>
              {data.folder ? ` · /${data.folder}` : ""}
            </p>
          )}

          {data.lastSync && (
            <p className="muted" style={{ marginTop: 8 }}>
              Último sync: {new Date(data.lastSync.at).toLocaleString("es-MX")} ·{" "}
              {data.lastSync.ok} ok, {data.lastSync.failed} fallidos
              {data.lastSync.error ? ` · error: ${data.lastSync.error}` : ""}
            </p>
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
        </>
      )}
    </div>
  );
}

// ─── Panel de gestión (carpeta + sincronizar + Teams + desconectar) ────────
function ScopeDetail({
  kind,
  title,
  data,
  canManage,
  onChanged,
  setBanner,
  onClose,
}: {
  kind: Kind;
  title: string;
  data: ScopeStatus;
  canManage: boolean;
  onChanged: () => void;
  setBanner: (b: { kind: "ok" | "error"; msg: string } | null) => void;
  onClose: () => void;
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
    onClose();
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
    <div className="card integration-detail">
      <div className="integration-detail-head">
        <h2 className="card-title" style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ONEDRIVE_LOGO} alt="" className="integration-logo" style={{ width: 24, height: 24 }} />
          {title}
        </h2>
        <button type="button" className="secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <p className="success" style={{ marginTop: 4 }}>
        ✓ Conectado{data.account ? ` como ${data.account}` : ""}
      </p>

      {needsReauth(data.lastSync?.error) && (
        <div className="reauth-banner">
          <strong>⚠️ Reconecta OneDrive</strong>
          <p>
            El permiso de acceso expiró (tu organización ahora exige MFA), por eso
            la sincronización automática está fallando. Cierra sesión y vuelve a
            entrar con tu cuenta Microsoft, o reconecta aquí, para reanudarla.
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
        <button
          type="button"
          onClick={saveFolder}
          disabled={saving || !folder.trim() || folder === data.folder}
        >
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
