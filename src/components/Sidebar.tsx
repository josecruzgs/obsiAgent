"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import {
  IconHome,
  IconUpload,
  IconNotes,
  IconGraph,
  IconSettings,
  IconUsers,
  IconLogout,
} from "./icons";

const items = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/ingest", label: "Ingerir", icon: IconUpload },
  { href: "/notas", label: "Notas", icon: IconNotes },
  { href: "/graph", label: "Grafo", icon: IconGraph },
  { href: "/config", label: "Configuración", icon: IconSettings },
];

interface Me {
  user: { email: string; name: string | null; role: string };
  company: { name: string } | null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

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
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="obsiAgent" />
        </span>
        <div className="sidebar-brand-text">
          <strong>obsiAgent</strong>
          {me?.company && <span>{me.company.name}</span>}
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map((it) => {
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
        <div className="sidebar-user">
          <span className="avatar">
            {(me?.user.name || me?.user.email || "?").charAt(0).toUpperCase()}
          </span>
          <div className="sidebar-user-text">
            <strong>{me?.user.name || me?.user.email || "—"}</strong>
            {me?.user.name && <span>{me.user.email}</span>}
          </div>
          <ThemeToggle />
        </div>
        <a href="/api/auth/logout" className="side-link side-logout">
          <IconLogout width={19} height={19} />
          Salir
        </a>
      </div>
    </aside>
  );
}
