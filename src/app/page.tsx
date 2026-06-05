import Link from "next/link";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [notes] = await query<{ count: string }>(
      `select count(*)::text as count from notes`
    );
    const [links] = await query<{ count: string }>(
      `select count(*)::text as count from links`
    );
    return { notes: Number(notes?.count ?? 0), links: Number(links?.count ?? 0), ok: true };
  } catch {
    return { notes: 0, links: 0, ok: false };
  }
}

export default async function Home() {
  const stats = await getStats();

  return (
    <>
      <h1>Tu base de conocimiento</h1>
      <p className="subtitle">
        Ingiere documentos, deja que la IA los conecte y consúltalos desde la web
        o por WhatsApp.
      </p>

      {!stats.ok && (
        <div className="card">
          <p className="error">
            No se pudo conectar a la base de datos. Verifica que Postgres esté
            corriendo (<code>docker compose up -d db</code>) y que ejecutaste{" "}
            <code>npm run migrate</code>.
          </p>
        </div>
      )}

      <div className="grid">
        <div className="card">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.notes}</div>
          <div className="muted">notas indexadas</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.links}</div>
          <div className="muted">enlaces entre notas</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>¿Por dónde empiezo?</h3>
        <ol className="muted" style={{ lineHeight: 1.9 }}>
          <li>
            <Link href="/ingest">Ingerir</Link> — pega texto raw; Claude genera
            resumen, tags y enlaces, y se guarda en tu vault de Obsidian.
          </li>
          <li>
            <Link href="/graph">Grafo</Link> — visualiza cómo se conectan tus
            notas.
          </li>
          <li>
            <Link href="/search">Buscar</Link> — pregunta en lenguaje natural y
            recibe respuestas con fuentes.
          </li>
          <li>
            WhatsApp — configura Evolution API apuntando el webhook a{" "}
            <code>/api/whatsapp/webhook</code> y pregunta desde tu teléfono.
          </li>
        </ol>
      </div>
    </>
  );
}
