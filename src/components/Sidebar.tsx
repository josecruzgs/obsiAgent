"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Item {
  href: string;
  label: string;
  icon: ReactNode;
}

const ICON = {
  stroke: "currentColor",
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const items: Item[] = [
  {
    href: "/",
    label: "Inicio",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    href: "/ingest",
    label: "Ingerir",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <path d="M12 15V4" />
        <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
        <path d="M5 20h14" />
      </svg>
    ),
  },
  {
    href: "/notas",
    label: "Notas",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <rect x="5" y="3" width="14" height="18" rx="2.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href: "/graph",
    label: "Grafo",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="9" r="2.4" />
        <circle cx="9" cy="18" r="2.4" />
        <path d="M8.1 7.1 15.9 8M10.4 16.2 16 11M8.2 15.8 7 8.3" />
      </svg>
    ),
  },
  {
    href: "/search",
    label: "Buscar",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="logo">🧠</span>
        obsiAgent
      </div>

      {items.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`sidebar-link${active ? " active" : ""}`}
          >
            {it.icon}
            {it.label}
          </Link>
        );
      })}

      <div className="sidebar-foot">IA · Obsidian · WhatsApp</div>
    </aside>
  );
}
