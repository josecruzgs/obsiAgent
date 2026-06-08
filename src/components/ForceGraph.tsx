"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GraphData } from "@/lib/types";

// react-force-graph-2d usa canvas/WebGL: solo en cliente, sin SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// Paleta determinista por tag (estilo "constelación", tonos violeta/cian).
const PALETTE = [
  "#8b7bff", "#3ad1e6", "#c08bff", "#4ee6b8",
  "#7aa8ff", "#ffa14d", "#ff7b9c", "#a78bfa",
];

function colorForTag(tag: string | undefined): string {
  if (!tag) return "#9b8cff";
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// "#rrggbb" -> "rgba(r,g,b,a)"
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function radiusOf(val: number | undefined): number {
  return Math.max(2.6, Math.sqrt(val ?? 1) * 2.2);
}

// Forma de nodo compatible con react-force-graph (id puede ser string|number,
// más nuestros campos y una index signature para el resto).
type GNode = {
  id?: string | number;
  x?: number;
  y?: number;
  val?: number;
  tags?: string[];
  title?: string;
  [others: string]: unknown;
};

interface Props {
  data: GraphData;
}

export default function ForceGraph({ data }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });

  useEffect(() => {
    function update() {
      if (wrapRef.current) {
        setSize({
          width: wrapRef.current.clientWidth,
          height: 560,
        });
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // react-force-graph muta el objeto data; le pasamos una copia.
  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ source: e.source, target: e.target })),
    }),
    [data]
  );

  return (
    <div ref={wrapRef} className="graph-scene">
      <ForceGraph2D
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        // Escena de fondo (retícula + resplandor morado), pintada cada frame en
        // coordenadas de pantalla para que no haga "fantasmas".
        onRenderFramePre={(ctx: CanvasRenderingContext2D) => {
          const canvas = ctx.canvas;
          const w = canvas.width;
          const h = canvas.height;
          const dpr = window.devicePixelRatio || 1;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = "#0a0816";
          ctx.fillRect(0, 0, w, h);
          const step = 30 * dpr;
          ctx.strokeStyle = "rgba(160,150,235,0.05)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 0; x <= w; x += step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
          }
          for (let y = 0; y <= h; y += step) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
          }
          ctx.stroke();
          const g = ctx.createRadialGradient(
            w / 2,
            h * 0.42,
            0,
            w / 2,
            h * 0.42,
            Math.max(w, h) * 0.5
          );
          g.addColorStop(0, "rgba(139,123,255,0.18)");
          g.addColorStop(1, "rgba(139,123,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }}
        nodeRelSize={4}
        nodeVal={(n: GNode) => n.val ?? 1}
        nodeLabel={(n: GNode) => n.title ?? String(n.id ?? "")}
        // Aristas: líneas tenues + partículas que fluyen (look constelación).
        linkColor={() => "rgba(150,140,235,0.2)"}
        linkWidth={0.6}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleColor={() => "rgba(185,170,255,0.9)"}
        onNodeClick={(n: GNode) => {
          // Abre el modal de búsqueda (en el header) con el título de la nota.
          const queryText = n.title ?? String(n.id ?? "");
          if (queryText)
            window.dispatchEvent(
              new CustomEvent("obsi-search", { detail: queryText })
            );
        }}
        // Área clickeable (necesaria al dibujar el nodo nosotros).
        nodePointerAreaPaint={(
          node: GNode,
          color: string,
          ctx: CanvasRenderingContext2D
        ) => {
          const r = radiusOf(node.val) + 4;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(
          node: GNode,
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const r = radiusOf(node.val);
          const c = colorForTag(node.tags?.[0]);

          // Glow + cuerpo del nodo.
          ctx.save();
          ctx.shadowColor = c;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = c;
          ctx.fill();
          ctx.restore();

          // Anillo exterior.
          ctx.beginPath();
          ctx.arc(x, y, r + 2.6, 0, 2 * Math.PI);
          ctx.strokeStyle = rgba(c, 0.45);
          ctx.lineWidth = 0.6;
          ctx.stroke();

          // Núcleo brillante.
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, r * 0.42), 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.fill();

          // Etiqueta al hacer zoom.
          if (globalScale >= 1.4) {
            const label = node.title ?? String(node.id ?? "");
            ctx.font = `${10 / globalScale}px sans-serif`;
            ctx.fillStyle = "rgba(232,228,255,0.85)";
            ctx.textAlign = "center";
            ctx.fillText(label, x, y + r + 9 / globalScale);
          }
        }}
      />
    </div>
  );
}
