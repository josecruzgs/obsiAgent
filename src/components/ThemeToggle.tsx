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

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className={`theme-toggle ${theme}`}
      onClick={toggle}
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      <span className="theme-toggle-knob" />
      <span className="theme-toggle-track">
        <span>
          <IconSun width={15} height={15} />
        </span>
        <span>
          <IconMoon width={15} height={15} />
        </span>
      </span>
    </button>
  );
}
