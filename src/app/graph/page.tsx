"use client";

import { useEffect, useState } from "react";
import ForceGraph from "@/components/ForceGraph";
import type { GraphData } from "@/lib/types";

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData({ nodes: d.nodes, edges: d.edges });
        else setError(d.error ?? "Error cargando el grafo");
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <>
      <h1>Grafo de conocimiento</h1>
      <p className="subtitle">
        Cada nodo es una nota; las aristas son enlaces <code>[[wikilink]]</code>.
        Haz zoom para ver títulos y clic en un nodo para consultarlo.
      </p>

      {error && <div className="card error">{error}</div>}

      {!data && !error && <p className="muted">Cargando grafo…</p>}

      {data && data.nodes.length === 0 && (
        <div className="card muted">
          Aún no hay notas. Ve a <a href="/ingest">Ingerir</a> para empezar.
        </div>
      )}

      {data && data.nodes.length > 0 && (
        <>
          <p className="muted">
            {data.nodes.length} notas · {data.edges.length} enlaces
          </p>
          <ForceGraph data={data} />
        </>
      )}
    </>
  );
}
