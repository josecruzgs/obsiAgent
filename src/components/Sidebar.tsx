"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconUpload,
  IconNotes,
  IconGraph,
  IconSettings,
  IconUsers,
  IconLogout,
} from "./icons";

// `adminOnly`: solo visible para superadmin (la ingesta y la configuración del
// vault son tareas de administración; el resto de usuarios solo consulta).
const items = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/ingest", label: "Ingerir", icon: IconUpload, adminOnly: true },
  { href: "/notas", label: "Notas", icon: IconNotes },
  { href: "/graph", label: "Grafo", icon: IconGraph },
  { href: "/config", label: "Configuración", icon: IconSettings, adminOnly: true },
];

interface Me {
  user: { email: string; name: string | null; role: string };
  company: { name: string } | null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra el menú móvil al navegar.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Cierra el menú del usuario al hacer clic fuera.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.authenticated && setMe(d))
      .catch(() => {});
  }, [pathname]);

  if (pathname === "/login") return null;

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <aside className={`sidebar${navOpen ? " open" : ""}`}>
      <div className="sidebar-head">
        <div className="sidebar-brand">
          <span className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="obsiAgent" />
          </span>
          <div className="sidebar-brand-text">
            <strong>ObsiAgent</strong>
            {me?.company && <span>{me.company.name}</span>}
          </div>
        </div>
        <button
          type="button"
          className="sidebar-burger"
          onClick={() => setNavOpen((o) => !o)}
          aria-label={navOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={navOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {navOpen ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      <div className="sidebar-collapse">
      <nav className="sidebar-nav">
        {items
          .filter((it) => !it.adminOnly || me?.user.role === "superadmin")
          .map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`side-link${isActive(it.href) ? " active" : ""}`}
            >
              <Icon width={19} height={19} />
              {it.label}
            </Link>
          );
        })}
        {me?.user.role === "superadmin" && (
          <Link
            href="/admin"
            className={`side-link${pathname.startsWith("/admin") ? " active" : ""}`}
          >
            <IconUsers width={19} height={19} />
            Administración
          </Link>
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-user-wrap" ref={menuRef}>
          {menuOpen && (
            <div className="user-menu" role="menu">
              <a href="/api/auth/logout" className="user-menu-item" role="menuitem">
                <IconLogout width={18} height={18} />
                Cerrar sesión
              </a>
            </div>
          )}
          <button
            type="button"
            className={`sidebar-user${menuOpen ? " open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="avatar">
              {(me?.user.name || me?.user.email || "?").charAt(0).toUpperCase()}
            </span>
            <div className="sidebar-user-text">
              <strong>{me?.user.name || me?.user.email || "—"}</strong>
              {me?.user.name && <span>{me.user.email}</span>}
            </div>
            <svg
              className="sidebar-user-caret"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
      </div>
    </aside>
  );
}
