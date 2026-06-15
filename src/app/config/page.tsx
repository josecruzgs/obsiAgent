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

// Estado de la instancia de WhatsApp (Evolution API). Ver /api/whatsapp/connection.
type WaState = "open" | "connecting" | "close" | "missing" | "unconfigured" | "error";
interface WaStatus {
  state: WaState;
  instance?: string;
  qr?: string | null;
  pairingCode?: string | null;
  detail?: string;
}

// Una clave de API configurable (GET /api/settings; los secretos llegan enmascarados).
interface SettingKey {
  key: string;
  label: string;
  group: "ia" | "whatsapp" | "voz" | "microsoft";
  secret: boolean;
  placeholder?: string;
  help?: string;
  source: "db" | "env" | "none";
  value: string;
  hint: string;
}

type Kind = "company" | "personal";
type Expandable = Kind | "sharepoint" | "whatsapp" | "teams";

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
  { name: "PLAUD", logo: "/images/integ-plaud.svg" },
];

const ONEDRIVE_LOGO = "/images/integ-onedrive.svg";
const TEAMS_LOGO = "/images/integ-teams.svg";
const SHAREPOINT_LOGO = "/images/integ-sharepoint.svg";
const WHATSAPP_LOGO = "/images/integ-whatsapp.svg";

export default function ConfigPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  // Qué tarjeta está desplegada (panel de gestión abierto).
  const [expanded, setExpanded] = useState<Expandable | null>(null);
  const [wa, setWa] = useState<WaStatus | null>(null);
  // Modal de vinculación de WhatsApp (QR) abierto.
  const [waModal, setWaModal] = useState(false);

  async function load() {
    const res = await fetch("/api/onedrive/status");
    if (res.ok) setStatus(await res.json());
  }

  // Estado de WhatsApp: solo el superadmin puede consultarlo.
  async function loadWa() {
    if (!status?.isSuperadmin) return;
    try {
      const res = await fetch("/api/whatsapp/connection");
      if (res.ok) setWa((await res.json()) as WaStatus);
    } catch {
      // sin red: se reintenta al refrescar
    }
  }
  useEffect(() => {
    loadWa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.isSuperadmin]);

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
              expanded={expanded === "teams"}
              onManage={() => toggle("teams")}
            />
            <SharePointTile
              data={status.sharepoint}
              canManage={status.isSuperadmin}
              expanded={expanded === "sharepoint"}
              onManage={() => toggle("sharepoint")}
            />
            <WhatsAppTile
              wa={wa}
              canManage={status.isSuperadmin}
              onVincular={() => setWaModal(true)}
              onStatus={setWa}
              setBanner={setBanner}
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
          ) : expanded === "teams" ? (
            <TeamsDetail
              connected={status.company.connected}
              canManage={status.isSuperadmin}
              onClose={() => setExpanded(null)}
            />
          ) : (expanded === "company" || expanded === "personal") &&
            status[expanded].connected ? (
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

          {/* Claves de API: cada sistema usa las suyas (solo superadmin). */}
          {status.isSuperadmin && <ApiKeysCard setBanner={setBanner} />}

          {/* Modal de vinculación de WhatsApp (QR). */}
          {waModal && (
            <WhatsAppModal
              onStatus={setWa}
              setBanner={setBanner}
              onClose={() => {
                setWaModal(false);
                loadWa();
              }}
            />
          )}
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
  expanded,
  onManage,
}: {
  connected: boolean;
  canManage: boolean;
  expanded: boolean;
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
        {expanded ? "Cerrar" : "Gestionar"}
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
    <div
      className={`integration-card${expanded ? " active" : ""}`}
      title="Transcripciones de reuniones de Teams"
    >
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

// ─── Panel de gestión de Teams (transcripciones de la cuenta de trabajo) ──────
function TeamsDetail({
  connected,
  canManage,
  onClose,
}: {
  connected: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [teams, setTeams] = useState<string | null>(null);

  async function syncTeams() {
    setSyncing(true);
    setTeams(null);
    try {
      const res = await fetch(`/api/teams/sync?scope=company`, { method: "POST" });
      const d = await res.json();
      setTeams(
        d.ok
          ? `✓ Teams: ${d.procesados}/${d.encontrados} transcripción(es) nueva(s), ${d.fallidos} fallida(s)`
          : `✗ ${d.error}`
      );
    } catch (err) {
      setTeams(`✗ ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="card integration-detail">
      <div className="integration-detail-head">
        <h2 className="card-title" style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TEAMS_LOGO} alt="" className="integration-logo" style={{ width: 24, height: 24 }} />
          Microsoft Teams
        </h2>
        <button type="button" className="secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {!canManage ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Solo el superadmin gestiona esta conexión.
        </p>
      ) : !connected ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Primero conecta tu OneDrive empresarial (Teams usa la misma cuenta de
          trabajo M365).
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Trae las transcripciones de tus reuniones de Teams y las añade al vault
            empresarial compartido (requiere cuenta de trabajo M365).
          </p>
          <div style={{ height: 14 }} />
          <button type="button" onClick={syncTeams} disabled={syncing}>
            {syncing ? "Trayendo transcripciones…" : "Sincronizar Teams (transcripciones)"}
          </button>
          {teams && (
            <p
              className={teams.startsWith("✓") ? "success" : "error"}
              style={{ marginTop: 12, fontSize: 13 }}
            >
              {teams}
            </p>
          )}
        </>
      )}
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

// ─── Tarjeta de WhatsApp (instancia de Evolution API) ───────────────────────
// El botón abre el modal del QR (no conectado) o desconecta directo (conectado).
function WhatsAppTile({
  wa,
  canManage,
  onVincular,
  onStatus,
  setBanner,
}: {
  wa: WaStatus | null;
  canManage: boolean;
  onVincular: () => void;
  onStatus: (wa: WaStatus) => void;
  setBanner: (b: { kind: "ok" | "error"; msg: string } | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const connected = wa?.state === "open";

  let status: React.ReactNode;
  if (!canManage) status = <span className="integration-status muted">—</span>;
  else if (!wa) status = <span className="integration-status muted">…</span>;
  else if (connected)
    status = <span className="integration-status ok">✓ Conectado</span>;
  else if (wa.state === "connecting")
    status = <span className="integration-status warn">Escanea el QR</span>;
  else if (wa.state === "unconfigured")
    status = <span className="integration-status muted">Falta configurar</span>;
  else if (wa.state === "error")
    status = <span className="integration-status warn">⚠️ Error</span>;
  else status = <span className="integration-status muted">No vinculado</span>;

  async function disconnect() {
    if (
      !confirm(
        "¿Desconectar WhatsApp? El agente dejará de responder hasta vincular un número de nuevo."
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      const d = await res.json();
      if (d.ok) {
        onStatus(d as WaStatus);
        setBanner({ kind: "ok", msg: "WhatsApp desconectado." });
      } else {
        setBanner({ kind: "error", msg: d.error || "Error con Evolution API." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="integration-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={WHATSAPP_LOGO} alt="WhatsApp" className="integration-logo" />
      <strong>WhatsApp</strong>
      {status}
      {canManage ? (
        connected ? (
          <button
            type="button"
            className="secondary"
            onClick={disconnect}
            disabled={busy}
          >
            {busy ? "…" : "Desconectar"}
          </button>
        ) : (
          <button type="button" onClick={onVincular}>
            Conectar
          </button>
        )
      ) : (
        <span className="integration-status muted" style={{ fontSize: 11 }}>
          Lo gestiona el superadmin
        </span>
      )}
    </div>
  );
}

// ─── Modal de WhatsApp: muestra el QR de Evolution para escanear ─────────────
function WhatsAppModal({
  onStatus,
  setBanner,
  onClose,
}: {
  onStatus: (wa: WaStatus) => void;
  setBanner: (b: { kind: "ok" | "error"; msg: string } | null) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<WaStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/whatsapp/connection?qr=1");
      if (!res.ok) return;
      const d = (await res.json()) as WaStatus;
      setData(d);
      onStatus(d);
      // Si quedó vinculado mientras el modal estaba abierto, avisa y cierra.
      if (d.state === "open") {
        setBanner({ kind: "ok", msg: "✓ WhatsApp vinculado correctamente." });
        onClose();
      }
    } catch {
      // sin red: se reintenta en el siguiente tick
    }
  }

  useEffect(() => {
    refresh();
    // El QR de Evolution caduca en ~40 s: se refresca solo mientras el modal
    // esté abierto (también detecta cuando ya quedó vinculado).
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cierra con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createInstance() {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const d = await res.json();
      if (d.ok) {
        setData(d as WaStatus);
        onStatus(d as WaStatus);
      } else {
        setBanner({ kind: "error", msg: d.error || "Error con Evolution API." });
      }
    } finally {
      setBusy(false);
    }
  }

  const qrSrc = data?.qr
    ? data.qr.startsWith("data:")
      ? data.qr
      : `data:image/png;base64,${data.qr}`
    : null;

  let body: React.ReactNode;
  if (!data) {
    body = <p className="muted">Consultando Evolution API…</p>;
  } else if (data.state === "unconfigured") {
    body = (
      <p className="muted">
        Primero configura la <strong>URL</strong> y la <strong>API key</strong> de
        Evolution API en la sección <strong>Claves de API</strong> (más abajo en
        esta página) y vuelve a intentar.
      </p>
    );
  } else if (data.state === "error") {
    body = (
      <p className="error">
        ✗ No se pudo contactar a Evolution API. Revisa la URL/API key en Claves de
        API.
        {data.detail ? ` (${data.detail})` : ""}
      </p>
    );
  } else if (data.state === "missing") {
    body = (
      <>
        <p className="muted">
          La instancia <code>{data.instance}</code> aún no existe en tu Evolution
          API. Créala aquí: quedará lista con el webhook apuntando a esta app y te
          mostrará el QR.
        </p>
        <button
          type="button"
          onClick={createInstance}
          disabled={busy}
          style={{ marginTop: 14 }}
        >
          {busy ? "Creando…" : "Crear instancia y generar QR"}
        </button>
      </>
    );
  } else {
    // close / connecting → mostrar el QR
    body = (
      <>
        <p className="muted" style={{ fontSize: 13 }}>
          En tu teléfono abre <strong>WhatsApp → Ajustes → Dispositivos vinculados →
          Vincular un dispositivo</strong> y escanea este código.
        </p>
        {qrSrc ? (
          <div style={{ textAlign: "center", marginTop: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="QR para vincular WhatsApp"
              style={{
                width: 260,
                height: 260,
                background: "#fff",
                padding: 12,
                borderRadius: 12,
              }}
            />
            {data.pairingCode && (
              <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                O ingresa este código en tu teléfono:{" "}
                <code>{data.pairingCode}</code>
              </p>
            )}
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              El código se renueva solo cada pocos segundos. En cuanto vincules, esta
              ventana se cierra sola.
            </p>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>
            Generando QR…{data.detail ? ` (${data.detail})` : ""}
          </p>
        )}
        <button
          type="button"
          className="secondary"
          onClick={refresh}
          disabled={busy}
          style={{ marginTop: 14 }}
        >
          Actualizar QR
        </button>
      </>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="integration-detail-head">
          <h2 className="card-title" style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={WHATSAPP_LOGO}
              alt=""
              className="integration-logo"
              style={{ width: 24, height: 24 }}
            />
            Vincular WhatsApp
          </h2>
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div style={{ marginTop: 14 }}>{body}</div>
      </div>
    </div>
  );
}

// ─── Claves de API (solo superadmin): cada sistema usa las suyas ─────────────
const GROUP_META: Record<
  SettingKey["group"],
  { title: string; icon: string; desc: string }
> = {
  ia: {
    title: "Inteligencia artificial",
    icon: "🧠",
    desc: "Claude, embeddings y voz (Whisper).",
  },
  whatsapp: {
    title: "WhatsApp",
    icon: "💬",
    desc: "Conexión con tu servidor Evolution API.",
  },
  voz: {
    title: "Agente de voz",
    icon: "📞",
    desc: "Retell AI para llamadas (opcional).",
  },
  microsoft: {
    title: "Microsoft Entra",
    icon: "🪟",
    desc: "Login y OneDrive / Teams / SharePoint.",
  },
};
const GROUP_ORDER: SettingKey["group"][] = ["ia", "whatsapp", "voz", "microsoft"];

function ApiKeysCard({
  setBanner,
}: {
  setBanner: (b: { kind: "ok" | "error"; msg: string } | null) => void;
}) {
  const [keys, setKeys] = useState<SettingKey[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.keys && setKeys(d.keys))
      .catch(() => {});
  }, []);

  // Solo se envían los campos que el usuario realmente escribió.
  const dirty = Object.entries(draft).filter(([, v]) => v.trim() !== "");

  async function post(values: Record<string, string | null>, okMsg: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const d = await res.json();
      if (d.ok) {
        setKeys(d.keys);
        setDraft({});
        setBanner({ kind: "ok", msg: okMsg });
      } else {
        setBanner({ kind: "error", msg: d.error || "No se pudo guardar." });
      }
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (dirty.length === 0) return;
    post(
      Object.fromEntries(dirty.map(([k, v]) => [k, v.trim()])),
      "Claves guardadas. Aplican de inmediato (sin reiniciar)."
    );
  }

  function sourceBadge(k: SettingKey) {
    if (k.source === "db")
      return (
        <span className="integration-status ok" style={{ marginLeft: 8 }}>
          Guardada aquí{k.hint ? ` · ${k.hint}` : ""}
        </span>
      );
    if (k.source === "env")
      return (
        <span className="integration-status muted" style={{ marginLeft: 8 }}>
          Del servidor{k.hint ? ` · ${k.hint}` : ""}
        </span>
      );
    return (
      <span className="integration-status muted" style={{ marginLeft: 8 }}>
        No configurada
      </span>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ margin: "0 0 4px" }}>Claves de API</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Pega aquí las claves de cada servicio. Se guardan en la base de datos y
        aplican al instante; si un campo queda vacío, se usa la clave del servidor
        (.env). Los secretos solo se muestran por sus últimos 4 caracteres.
      </p>

      {!keys ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <div className="apikeys-grid">
            {GROUP_ORDER.map((g) => {
              const items = keys.filter((k) => k.group === g);
              if (items.length === 0) return null;
              const meta = GROUP_META[g];
              return (
                <div key={g} className="card apikey-card">
                  <div className="apikey-card-head">
                    <span className="apikey-card-icon" aria-hidden>
                      {meta.icon}
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15 }}>{meta.title}</h3>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        {meta.desc}
                      </p>
                    </div>
                  </div>

                  {g === "microsoft" && (
                    <p className="error" style={{ fontSize: 12, margin: "10px 0 0" }}>
                      ⚠️ También se usan para iniciar sesión: un valor incorrecto
                      puede dejar la app sin acceso. Cámbialas solo si sabes lo que
                      haces.
                    </p>
                  )}

                  {items.map((k) => (
                    <div key={k.key} style={{ marginTop: 14 }}>
                      <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
                        {k.label}
                        {sourceBadge(k)}
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type={k.secret ? "password" : "text"}
                          autoComplete="new-password"
                          value={draft[k.key] ?? (k.secret ? "" : k.value)}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [k.key]: e.target.value }))
                          }
                          placeholder={
                            k.secret && k.hint
                              ? "Pega una clave nueva para reemplazar la actual"
                              : k.placeholder || ""
                          }
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        {k.source === "db" && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              post(
                                { [k.key]: null },
                                "Clave quitada; vuelve a usarse la del servidor (si existe)."
                              )
                            }
                            disabled={saving}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      {k.help && (
                        <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                          {k.help}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 6, marginBottom: 18 }}>
            <button type="button" onClick={save} disabled={saving || dirty.length === 0}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            {dirty.length > 0 && (
              <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                {dirty.length} cambio(s) sin guardar
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
