"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GraphData } from "@/lib/types";

// react-force-graph-2d usa canvas/WebGL: solo en cliente, sin SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// Paleta determinista por tag para colorear clusters.
const PALETTE = [
  "#7c5cff", "#00c2a8", "#ff8c42", "#ff6b9d",
  "#4dabf7", "#ffd43b", "#69db7c", "#e599f7",
];

function colorForTag(tag: string | undefined): string {
  if (!tag) return "#8a93a6";
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
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
    <div
      ref={wrapRef}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "#0c0e12",
      }}
    >
      <ForceGraph2D
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="#0c0e12"
        nodeRelSize={4}
        nodeVal={(n: GNode) => n.val ?? 1}
        nodeColor={(n: GNode) => colorForTag(n.tags?.[0])}
        linkColor={() => "#2a3040"}
        linkWidth={1}
        nodeLabel={(n: GNode) => n.title ?? String(n.id ?? "")}
        onNodeClick={(n: GNode) => {
          if (n.id != null)
            window.location.href = `/search?note=${encodeURIComponent(String(n.id))}`;
        }}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(
          node: GNode,
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
          if (globalScale < 1.5) return; // etiquetas solo al hacer zoom
          const label = node.title ?? String(node.id ?? "");
          ctx.font = `${10 / globalScale}px sans-serif`;
          ctx.fillStyle = "#cfd4dd";
          ctx.textAlign = "center";
          ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + 8 / globalScale);
        }}
      />
    </div>
  );
}
