"use client";

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

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="topnav">
      <div className="brand">
        <span className="logo">
          <IconLogo />
        </span>
        obsiAgent
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
      </div>

      <div className="nav-actions">
        <ThemeToggle />
      </div>
    </nav>
  );
}
