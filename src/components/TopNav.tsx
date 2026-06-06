"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { IconLogo } from "./icons";

const items = [
  { href: "/", label: "Inicio" },
  { href: "/ingest", label: "Ingerir" },
  { href: "/notas", label: "Notas" },
  { href: "/graph", label: "Grafo" },
  { href: "/config", label: "Config" },
];

interface Me {
  user: { email: string; name: string | null; role: string };
  company: { name: string } | null;
}

export default function TopNav() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.authenticated && setMe(d))
      .catch(() => {});
  }, [pathname]);

  // En la pantalla de login no mostramos la navegación.
  if (pathname === "/login") return null;

  return (
    <nav className="topnav">
      <div className="brand">
        <span className="logo">
          <IconLogo />
        </span>
        obsiAgent
        {me?.company && <span className="brand-company">· {me.company.name}</span>}
      </div>

      <div className="nav-pills">
        {items.map((it) => {
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`nav-pill${active ? " active" : ""}`}
            >
              {it.label}
            </Link>
          );
        })}
        {me?.user.role === "superadmin" && (
          <Link
            href="/admin"
            className={`nav-pill${pathname.startsWith("/admin") ? " active" : ""}`}
          >
            Admin
          </Link>
        )}
      </div>

      <div className="nav-actions">
        <ThemeToggle />
        {me && (
          <>
            <span className="nav-user" title={me.user.email}>
              {me.user.name || me.user.email}
            </span>
            <a href="/api/auth/logout" className="nav-pill">
              Salir
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
