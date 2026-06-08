"use client";

import { useEffect, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("error")) setError(p.get("error"));
  }, []);

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <span className="logo logo-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="obsiAgent" />
        </span>
        <h1 style={{ marginTop: 12 }}>ObsiAgent</h1>
        <p className="subtitle" style={{ marginBottom: 24 }}>
          Inicia sesión para acceder a tu base de conocimiento.
        </p>

        {error && (
          <p className="error" style={{ marginBottom: 16 }}>
            ✗ {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => (window.location.href = "/api/auth/login")}
          style={{ width: "100%" }}
        >
          Iniciar sesión con Microsoft
        </button>
      </div>
    </div>
  );
}
