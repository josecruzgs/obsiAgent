"use client";

import { useEffect, useState } from "react";
import { IconSun, IconMoon } from "./icons";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current =
      (document.documentElement.dataset.theme as Theme) ||
      (localStorage.getItem("theme") as Theme) ||
      "dark";
    setTheme(current);
  }, []);

  function set(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="theme-switch" role="group" aria-label="Tema claro u oscuro">
      <button
        type="button"
        className={`theme-seg${theme === "light" ? " active" : ""}`}
        onClick={() => set("light")}
        aria-pressed={theme === "light"}
        title="Modo claro"
      >
        <IconSun width={16} height={16} />
      </button>
      <button
        type="button"
        className={`theme-seg${theme === "dark" ? " active" : ""}`}
        onClick={() => set("dark")}
        aria-pressed={theme === "dark"}
        title="Modo oscuro"
      >
        <IconMoon width={16} height={16} />
      </button>
    </div>
  );
}
