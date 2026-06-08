"use client";

import { useState } from "react";
import { INTERACTIONS, fmtUSD } from "@/lib/costs";
import { IconCoins, IconChevron } from "./icons";

// Widget del rail derecho: estima el costo mensual de las APIs (Anthropic,
// OpenAI, Voyage, Retell) según cuántas interacciones de cada tipo esperas.
// Plegable: arranca contraído y muestra el total en la cabecera.
export default function CostEstimator() {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(INTERACTIONS.map((i) => [i.key, i.defaultQty]))
  );

  const total = INTERACTIONS.reduce(
    (sum, i) => sum + i.unitCost * (qty[i.key] || 0),
    0
  );

  return (
    <div className="widget">
      <div className="fold-head">
        <h3>
          <IconCoins className="widget-ico" />
          Costos estimados
        </h3>
        <span className="fold-right">
          <span className="fold-total">{fmtUSD(total)}/mes</span>
          <button
            type="button"
            className="fold-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Contraer" : "Expandir"}
          >
            <IconChevron className={`fold-chevron${open ? " open" : ""}`} />
          </button>
        </span>
      </div>

      {open && (
        <div className="widget-fold-body">
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 11 }}>
            Estimación mensual (USD). Ajusta las cantidades.
          </p>

          {INTERACTIONS.map((i) => (
            <div key={i.key} className="cost-row" title={i.hint}>
              <div className="cost-label">
                <span>{i.label}</span>
                <span className="cost-unit">{fmtUSD(i.unitCost)} c/u</span>
              </div>
              <input
                type="number"
                min={0}
                value={qty[i.key]}
                onChange={(e) =>
                  setQty({ ...qty, [i.key]: Math.max(0, Number(e.target.value) || 0) })
                }
                className="cost-input"
                aria-label={`Cantidad de ${i.label} al mes`}
              />
              <span className="cost-sub">{fmtUSD(i.unitCost * (qty[i.key] || 0))}</span>
            </div>
          ))}

          <div className="cost-total">
            <span>Total / mes</span>
            <strong>{fmtUSD(total)}</strong>
          </div>

          <p className="muted" style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.35 }}>
            Precios aproximados de Anthropic, OpenAI, Voyage y Retell. Solo referencia.
          </p>
        </div>
      )}
    </div>
  );
}
