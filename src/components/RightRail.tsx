"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BackgroundPicker from "./BackgroundPicker";

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
interface ODStatus {
  isSuperadmin: boolean;
  company: ScopeStatus;
  personal: ScopeStatus;
}
interface Me {
  user: { email: string; name: string | null; role: string };
  company: { name: string } | null;
}

export default function RightRail() {
  const [me, setMe] = useState<Me | null>(null);
  const [od, setOd] = useState<ODStatus | null>(null);
  const [syncing, setSyncing] = useState<"company" | "personal" | null>(null);

  async function loadOd() {
    const r = await fetch("/api/onedrive/status");
    if (r.ok) setOd(await r.json());
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.authenticated && setMe(d))
      .catch(() => {});
    loadOd();
  }, []);

  async function sync(scope: "company" | "personal") {
    setSyncing(scope);
    try {
      await fetch(`/api/onedrive/sync?scope=${scope}`, { method: "POST" });
      await loadOd();
    } finally {
      setSyncing(null);
    }
  }

  function fmtSync(s: SyncSummary | null) {
    if (!s) return "nunca";
    const d = new Date(s.at);
    return `${d.toLocaleDateString("es-MX")} · ${s.ok} ok`;
  }

  return (
    <aside className="rail">
      {/* Cuenta / empresa */}
      <div className="widget">
        <h3>Cuenta</h3>
        <div className="widget-row">
          <span className="k">Empresa</span>
          <span className="v">{me?.company?.name ?? "—"}</span>
        </div>
        <div className="widget-row">
          <span className="k">Usuario</span>
          <span className="v">{me?.user.name || me?.user.email || "—"}</span>
        </div>
        <div className="widget-row">
          <span className="k">Rol</span>
          <span className="v">
            <span className={`badge${me?.user.role === "superadmin" ? "" : " dim"}`}>
              {me?.user.role === "superadmin" ? "Superadmin" : "Miembro"}
            </span>
          </span>
        </div>
      </div>

      {/* OneDrive */}
      <div className="widget">
        <h3>OneDrive</h3>

        {od?.isSuperadmin && (
          <>
            <div className="widget-row">
              <span className="k">
                <span className={`dot ${od.company.connected ? "on" : "off"}`} />
                Empresarial
              </span>
              <span className="v">{od.company.folder}</span>
            </div>
            <div className="widget-row">
              <span className="k">Último</span>
              <span className="v">{fmtSync(od.company.lastSync)}</span>
            </div>
            {od.company.connected && (
              <button
                type="button"
                className="mini-btn"
                onClick={() => sync("company")}
                disabled={syncing !== null}
              >
                {syncing === "company" ? "Sincronizando…" : "Sincronizar empresarial"}
              </button>
            )}
            <div style={{ height: 14 }} />
          </>
        )}

        <div className="widget-row">
          <span className="k">
            <span className={`dot ${od?.personal.connected ? "on" : "off"}`} />
            Personal
          </span>
          <span className="v">{od?.personal.folder ?? "—"}</span>
        </div>
        <div className="widget-row">
          <span className="k">Último</span>
          <span className="v">{fmtSync(od?.personal.lastSync ?? null)}</span>
        </div>
        {od?.personal.connected ? (
          <button
            type="button"
            className="mini-btn"
            onClick={() => sync("personal")}
            disabled={syncing !== null}
          >
            {syncing === "personal" ? "Sincronizando…" : "Sincronizar personal"}
          </button>
        ) : (
          <Link href="/config" className="mini-btn" style={{ display: "block", textAlign: "center" }}>
            Conectar personal
          </Link>
        )}
      </div>

      {/* Fondo (3 temas con imagen) */}
      <BackgroundPicker />

      {/* Atajos */}
      <div className="widget">
        <h3>Atajos</h3>
        <div className="widget-row">
          <Link href="/ingest" className="k">Ingerir documentos</Link>
        </div>
        <div className="widget-row">
          <Link href="/notas" className="k">Ver notas</Link>
        </div>
        <div className="widget-row">
          <Link href="/graph" className="k">Grafo de conocimiento</Link>
        </div>
        <div className="widget-row">
          <Link href="/config" className="k">Configuración</Link>
        </div>
      </div>
    </aside>
  );
}
