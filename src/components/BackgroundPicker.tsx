"use client";

import { useEffect, useState } from "react";

// Fondo: "none" = sin imagen. "1"|"2"|"3" usan /public/images/{n}.jpg.
type Bg = "none" | "1" | "2" | "3";
const BG_OPTIONS: Bg[] = ["none", "1", "2", "3"];

// Acento: cambia el color principal (--accent) de toda la interfaz.
type Accent = "purple" | "green" | "blue" | "orange";
const ACCENTS: { key: Accent; color: string; label: string }[] = [
  { key: "purple", color: "#8b7bff", label: "Morado" },
  { key: "green", color: "#16c784", label: "Verde" },
  { key: "blue", color: "#4dabf7", label: "Azul" },
  { key: "orange", color: "#ff8c42", label: "Naranja" },
];

export default function BackgroundPicker() {
  const [bg, setBg] = useState<Bg>("none");
  const [accent, setAccent] = useState<Accent>("purple");

  useEffect(() => {
    const el = document.documentElement;
    setBg((el.dataset.bg as Bg) || (localStorage.getItem("bgTheme") as Bg) || "none");
    setAccent(
      (el.dataset.accent as Accent) ||
        (localStorage.getItem("accent") as Accent) ||
        "purple"
    );
  }, []);

  function chooseBg(next: Bg) {
    setBg(next);
    if (next === "none") delete document.documentElement.dataset.bg;
    else document.documentElement.dataset.bg = next;
    try {
      localStorage.setItem("bgTheme", next);
    } catch {
      /* ignore */
    }
  }

  function chooseAccent(next: Accent) {
    setAccent(next);
    if (next === "purple") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = next;
    try {
      localStorage.setItem("accent", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="widget">
      <h3>Tema</h3>

      <span className="theme-sub">Color de acento</span>
      <div className="accent-picker">
        {ACCENTS.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`accent-opt${accent === a.key ? " active" : ""}`}
            style={{ ["--ac"]: a.color } as React.CSSProperties}
            onClick={() => chooseAccent(a.key)}
            title={a.label}
            aria-label={`Acento ${a.label}`}
          />
        ))}
      </div>

      <span className="theme-sub">Fondo</span>
      <div className="bg-picker">
        {BG_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`bg-opt${bg === opt ? " active" : ""}${
              opt === "none" ? "" : ` bg-opt-${opt}`
            }`}
            onClick={() => chooseBg(opt)}
            title={opt === "none" ? "Sin imagen" : `Tema ${opt}`}
            aria-label={opt === "none" ? "Sin imagen de fondo" : `Tema ${opt}`}
          >
            {opt === "none" ? "Sin" : null}
          </button>
        ))}
      </div>
    </div>
  );
}
