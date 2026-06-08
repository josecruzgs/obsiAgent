"use client";

import { useEffect, useState } from "react";

// Logos placeholder (sustitúyelos por los reales en /public/images).
const CLIENT_LOGOS = [
  "/images/client-1.svg",
  "/images/client-2.svg",
  "/images/client-3.svg",
  "/images/client-4.svg",
  "/images/client-5.svg",
  "/images/client-6.svg",
];

// Un "set" ancho (repetido) y duplicado, para un marquee sin huecos a -50%.
const MARQUEE_SET = [...CLIENT_LOGOS, ...CLIENT_LOGOS, ...CLIENT_LOGOS];
const MARQUEE = [...MARQUEE_SET, ...MARQUEE_SET];

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("error")) setError(p.get("error"));
  }, []);

  return (
    <div className="login-page">
      <header className="login-topbar">
        <div className="login-brand">
          <span className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="ObsiAgent" />
          </span>
          <strong>ObsiAgent</strong>
        </div>
        <button
          type="button"
          className="login-cta"
          onClick={() => (window.location.href = "/api/auth/login")}
        >
          Iniciar sesión
        </button>
      </header>

      <section className="login-hero">
        <div className="login-hero-left">
          <span className="login-badge">✦ Conocimiento con IA</span>
          <h1>
            Tu base de conocimiento,
            <br />
            potenciada con IA.
          </h1>
          <p className="login-sub">
            Ingiere documentos, deja que los agentes los conecten y consúltalos
            desde la web, por WhatsApp o por voz.
          </p>

          {error && <p className="error login-error">✗ {error}</p>}

          <div className="login-actions">
            <button
              type="button"
              onClick={() => (window.location.href = "/api/auth/login")}
            >
              Iniciar sesión con Microsoft
            </button>
            <a className="login-ghost" href="https://obsiagent.iagent.mx">
              Conocer más
            </a>
          </div>
        </div>

        <div className="login-hero-right">
          <div className="login-orb" aria-hidden="true" />
        </div>
      </section>

      <section className="login-marquee">
        <div className="marquee">
          <div className="marquee-track">
            {MARQUEE.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="marquee-logo" />
            ))}
          </div>
        </div>
        <p className="login-marquee-title">
          Con la confianza de equipos de inversión e investigación de primer nivel
        </p>
      </section>
    </div>
  );
}
