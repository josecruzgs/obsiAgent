"use client";

import { useEffect, useState } from "react";

// "none" = sin imagen (se mantiene el fondo por defecto). "1"|"2"|"3" usan
// /public/images/{n}.jpg como fondo del <body> en todas las páginas.
type Bg = "none" | "1" | "2" | "3";

const OPTIONS: Bg[] = ["none", "1", "2", "3"];

export default function BackgroundPicker() {
  const [bg, setBg] = useState<Bg>("none");

  useEffect(() => {
    const current =
      (document.documentElement.dataset.bg as Bg) ||
      (localStorage.getItem("bgTheme") as Bg) ||
      "none";
    setBg(current);
  }, []);

  function choose(next: Bg) {
    setBg(next);
    if (next === "none") {
      delete document.documentElement.dataset.bg;
    } else {
      document.documentElement.dataset.bg = next;
    }
    try {
      localStorage.setItem("bgTheme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="widget">
      <h3>Fondo</h3>
      <div className="bg-picker">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`bg-opt${bg === opt ? " active" : ""}${
              opt === "none" ? " bg-none" : ""
            }`}
            style={
              opt === "none"
                ? undefined
                : { backgroundImage: `url(/images/${opt}.jpg)` }
            }
            onClick={() => choose(opt)}
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
