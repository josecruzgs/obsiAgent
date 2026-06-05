"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HeaderBar() {
  const [q, setQ] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <div className="hero">
      <div className="hero-eyebrow">obsiAgent</div>
      <div className="hero-title">Tu base de conocimiento</div>
      <form className="hero-search" onSubmit={submit}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pregunta a tu conocimiento… (ej. ¿qué sé del despacho?)"
        />
        <button type="submit" disabled={!q.trim()}>
          Buscar
        </button>
      </form>
    </div>
  );
}
